// Schema-less Protocol Buffers wire-format codec for AC EVO car data files.
//
// AC EVO serializes per-car physics (cardata.car, .engine, .suspension, ...) as protobuf,
// not the INI-like text the editors expect — confirmed by decoding a real cardata.car
// (e.g. an embedded "Abarth 695 Biposto" string field next to float32 fields). No public
// .proto schemas exist, so this decodes the raw wire format into editable leaf values
// (floats, ints, strings) by field number and re-encodes them.
//
// Round-trip is LOSSLESS by construction: every node keeps its original tag+value bytes and
// is re-emitted verbatim unless it (or a descendant) was edited. So unedited data is never
// perturbed, and the message-vs-string/bytes classification heuristic can never corrupt
// fields you didn't touch — it only affects how values are shown and which are editable.
//
// Pure JS (Uint8Array / DataView / TextDecoder), no Node-only APIs, so it runs in both the
// renderer and the test runner.

const textDecoder = new TextDecoder("utf-8", { fatal: false });
const textEncoder = new TextEncoder();
const MAX_DEPTH = 32;

export const WIRE_VARINT = 0;
export const WIRE_FIXED64 = 1;
export const WIRE_LEN = 2;
export const WIRE_FIXED32 = 5;

function concatBytes(chunks) {
	let total = 0;
	for (const chunk of chunks) total += chunk.length;
	const out = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.length;
	}
	return out;
}

function copyOf(bytes) {
	return bytes.slice();
}

function viewOf(bytes) {
	const ab = new ArrayBuffer(bytes.length);
	new Uint8Array(ab).set(bytes);
	return new DataView(ab);
}

export function encodeVarint(value) {
	let v = BigInt(value);
	if (v < 0n) v &= 0xffffffffffffffffn; // two's-complement for the rare negative varint
	const bytes = [];
	do {
		let byte = Number(v & 0x7fn);
		v >>= 7n;
		if (v > 0n) byte |= 0x80;
		bytes.push(byte);
	} while (v > 0n);
	return Uint8Array.from(bytes);
}

class Reader {
	constructor(bytes) {
		this.bytes = bytes;
		this.offset = 0;
	}

	get eof() {
		return this.offset >= this.bytes.length;
	}

	varint() {
		let shift = 0n;
		let result = 0n;
		let count = 0;
		for (; ;) {
			if (this.offset >= this.bytes.length) throw new Error("varint overrun");
			const byte = this.bytes[this.offset];
			this.offset += 1;
			result |= BigInt(byte & 0x7f) << shift;
			count += 1;
			if ((byte & 0x80) === 0) break;
			shift += 7n;
			if (count > 10) throw new Error("varint too long");
		}
		return result;
	}

	take(n) {
		if (n < 0 || this.offset + n > this.bytes.length) throw new Error("length overrun");
		const slice = this.bytes.subarray(this.offset, this.offset + n);
		this.offset += n;
		return slice;
	}
}

// Low-level pass: parse a buffer into flat nodes without classifying length-delimited values.
function tryParse(bytes) {
	const fields = [];
	const reader = new Reader(bytes);
	try {
		while (!reader.eof) {
			const tagStart = reader.offset;
			const tag = reader.varint();
			const fieldNumber = Number(tag >> 3n);
			const wireType = Number(tag & 7n);
			if (fieldNumber === 0) return null;
			const tagBytes = copyOf(bytes.subarray(tagStart, reader.offset));
			const node = { field: fieldNumber, wireType, tagBytes, modified: false };
			if (wireType === WIRE_VARINT) {
				node.varint = reader.varint();
			} else if (wireType === WIRE_FIXED64) {
				node.fixed64 = copyOf(reader.take(8));
			} else if (wireType === WIRE_FIXED32) {
				node.fixed32 = copyOf(reader.take(4));
			} else if (wireType === WIRE_LEN) {
				const len = Number(reader.varint());
				node.content = copyOf(reader.take(len));
				node.message = null;
			} else {
				return null; // groups (3/4) are obsolete and unsupported
			}
			node.original = copyOf(bytes.subarray(tagStart, reader.offset));
			fields.push(node);
		}
	} catch {
		return null;
	}
	return fields;
}

function isMostlyPrintable(bytes) {
	if (bytes.length === 0) return false;
	let printable = 0;
	for (const byte of bytes) {
		if (byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte < 127)) printable += 1;
	}
	return printable / bytes.length > 0.85;
}

// Pure text: valid UTF-8 containing only printable characters and common whitespace. A
// nested message almost always fails this (its float/varint/length bytes include controls
// like 0x00), so structured data is preferred over the string interpretation.
function isPureText(bytes) {
	let decoded;
	try {
		decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch {
		return false;
	}
	for (const ch of decoded) {
		const code = ch.codePointAt(0);
		if (code === 9 || code === 10 || code === 13) continue;
		if (code < 32 || code === 127) return false;
	}
	return true;
}

// A length-delimited value can be a nested message whose serialized bytes are ENTIRELY
// printable — classically a wrapper like { 1: "content\cars\...\foo.material" }, which on
// the wire is `0A <len> <ascii-path>` (tag 0x0A is itself a printable/whitespace byte, and a
// short length byte is printable too). isPureText() would call that a string, so the wrapper
// and its inner path get treated as one opaque string — and any id rewrite of the inner path
// is then skipped (the leading 0x0A reads as a control char). That left some references on the
// old car id while their plain-string siblings were rewritten to the new id; the game registers
// a design/material under one id and looks it up under the other, and protobuf's map CHECK
// aborts (FatalException). So: detect a *structured* wrapper and prefer the message reading.
// A parse is "structured" only if it has a length-delimited child that is itself clean text or a
// nested structured message — coincidental parses of real text (varint-only, or garbage children)
// stay strings. Round-trip stays lossless either way; this only changes which leaves are editable.
function isStructuredMessage(parsed, depth) {
	if (!parsed || !parsed.length || depth >= MAX_DEPTH) return false;
	let lenChildren = 0;
	for (const child of parsed) {
		if (child.wireType !== WIRE_LEN) continue; // varint/fixed children are always plausible
		lenChildren += 1;
		if (child.content.length === 0) continue;
		if (isPureText(child.content)) continue;
		if (!isStructuredMessage(tryParse(child.content), depth + 1)) return false;
	}
	return lenChildren > 0;
}

// Decide whether a length-delimited value is a nested message, a string, or opaque bytes,
// and recurse into messages. Display-only — never affects round-trip fidelity.
function classify(node, depth) {
	if (node.wireType !== WIRE_LEN) return node;
	if (node.content.length === 0) {
		node.kind = "bytes";
		return node;
	}
	const parsed = depth < MAX_DEPTH ? tryParse(node.content) : null;
	if (parsed && parsed.length && (!isPureText(node.content) || isStructuredMessage(parsed, depth))) {
		node.message = parsed.map((child) => classify(child, depth + 1));
		node.kind = "message";
	} else if (isPureText(node.content) || isMostlyPrintable(node.content)) {
		node.kind = "string";
	} else if (parsed && parsed.length) {
		node.message = parsed.map((child) => classify(child, depth + 1));
		node.kind = "message";
	} else {
		node.kind = "bytes";
	}
	return node;
}

/** Decode a protobuf buffer. Returns { valid, fields }. */
export function decode(bytes) {
	const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	const parsed = tryParse(input);
	if (!parsed || !parsed.length) {
		return { valid: false, fields: [] };
	}
	return { valid: true, fields: parsed.map((node) => classify(node, 0)) };
}

function isDirty(node) {
	if (node.modified) return true;
	if (node.message) return node.message.some(isDirty);
	return false;
}

function encodeNode(node) {
	if (!isDirty(node)) return node.original;
	if (node.wireType === WIRE_VARINT) {
		return concatBytes([node.tagBytes, encodeVarint(node.varint)]);
	}
	if (node.wireType === WIRE_FIXED64) {
		return concatBytes([node.tagBytes, node.fixed64]);
	}
	if (node.wireType === WIRE_FIXED32) {
		return concatBytes([node.tagBytes, node.fixed32]);
	}
	// WIRE_LEN: re-encode the sub-message (recomputing its length) or emit edited content.
	const content = node.message ? encode(node.message) : node.content;
	return concatBytes([node.tagBytes, encodeVarint(content.length), content]);
}

/** Encode fields produced by decode() back to bytes (lossless for unedited nodes). */
export function encode(fields) {
	return concatBytes(fields.map(encodeNode));
}

export function bytesToFloat32(bytes) {
	return viewOf(bytes).getFloat32(0, true);
}

export function bytesToFloat64(bytes) {
	return viewOf(bytes).getFloat64(0, true);
}

export function float32ToBytes(value) {
	const view = new DataView(new ArrayBuffer(4));
	view.setFloat32(0, value, true);
	return new Uint8Array(view.buffer);
}

export function float64ToBytes(value) {
	const view = new DataView(new ArrayBuffer(8));
	view.setFloat64(0, value, true);
	return new Uint8Array(view.buffer);
}

function toHex(bytes) {
	return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(" ");
}

function leafKind(node) {
	if (node.wireType === WIRE_VARINT) return "varint";
	if (node.wireType === WIRE_FIXED64) return "double";
	if (node.wireType === WIRE_FIXED32) return "float";
	if (node.wireType === WIRE_LEN && node.kind === "string") return "string";
	return "bytes";
}

function leafValue(node, kind) {
	if (kind === "varint") return node.varint.toString();
	if (kind === "double") return String(bytesToFloat64(node.fixed64));
	if (kind === "float") return String(bytesToFloat32(node.fixed32));
	if (kind === "string") return textDecoder.decode(node.content);
	return toHex(node.content);
}

/**
 * Flatten decoded fields into editable leaf rows. `path` is the chain of array indices used
 * by setValue(); `label` is the human field-number chain (e.g. "1.2"). `editable` is false
 * for opaque bytes (read-only to avoid blind corruption).
 */
export function toRows(fields, prefixPath = [], prefixLabel = "", groupLabel = "") {
	// Detect repeated sub-messages among siblings so leaves can carry a structural hint
	// like "1#2/4" (2nd of 4 sub-messages under field 1) -> likely a wheel/gear/array item.
	const messageCounts = {};
	for (const node of fields) {
		if (node.wireType === WIRE_LEN && node.message) {
			messageCounts[node.field] = (messageCounts[node.field] || 0) + 1;
		}
	}
	const messageIndex = {};
	const rows = [];
	fields.forEach((node, index) => {
		const path = [...prefixPath, index];
		const label = prefixLabel ? `${prefixLabel}.${node.field}` : `${node.field}`;
		if (node.wireType === WIRE_LEN && node.message) {
			let childGroup = groupLabel;
			const count = messageCounts[node.field];
			if (count >= 2) {
				messageIndex[node.field] = (messageIndex[node.field] || 0) + 1;
				childGroup = `${node.field}#${messageIndex[node.field]}/${count}`;
			}
			// Push without spread: a mis-parsed binary blob can yield hundreds of thousands of
			// fields, and push(...hugeArray) overflows the argument-count limit.
			const childRows = toRows(node.message, path, label, childGroup);
			for (const childRow of childRows) rows.push(childRow);
			return;
		}
		const kind = leafKind(node);
		rows.push({
			path,
			label,
			field: node.field,
			wireType: node.wireType,
			kind,
			value: leafValue(node, kind),
			editable: kind !== "bytes",
			group: groupLabel,
		});
	});
	return rows;
}

function nodeAtPath(fields, path) {
	let list = fields;
	let node = null;
	for (const index of path) {
		node = list[index];
		if (!node) throw new Error("Invalid field path.");
		list = node.message || [];
	}
	return node;
}

/** Apply an edited value to a leaf node by path. Returns { ok, error }. */
export function setValue(fields, path, kind, rawInput) {
	let node;
	try {
		node = nodeAtPath(fields, path);
	} catch (error) {
		return { ok: false, error: error.message };
	}
	if (kind === "float" || kind === "double") {
		const value = Number(String(rawInput).trim());
		if (!Number.isFinite(value)) return { ok: false, error: "Enter a finite number." };
		if (kind === "float") node.fixed32 = float32ToBytes(value);
		else node.fixed64 = float64ToBytes(value);
		node.modified = true;
		return { ok: true };
	}
	if (kind === "varint") {
		const text = String(rawInput).trim();
		if (!/^-?\d+$/.test(text)) return { ok: false, error: "Enter a whole number." };
		node.varint = BigInt(text);
		node.modified = true;
		return { ok: true };
	}
	if (kind === "string") {
		node.content = textEncoder.encode(String(rawInput));
		node.message = null;
		node.modified = true;
		return { ok: true };
	}
	return { ok: false, error: "This field type is read-only." };
}

/**
 * Append a new top-level varint field. proto3 omits default (0) values, so a field like
 * drivetrain.tractionType is simply absent on an RWD car — there is no node to setValue(). This
 * adds one so the value can be set on any car. `fieldNumber` is the schema field number.
 */
export function appendVarint(fields, fieldNumber, value) {
	const text = String(value).trim();
	if (!/^-?\d+$/.test(text)) return { ok: false, error: "Enter a whole number." };
	const tag = (BigInt(fieldNumber) << 3n) | BigInt(WIRE_VARINT);
	fields.push({ field: fieldNumber, wireType: WIRE_VARINT, tagBytes: encodeVarint(tag), varint: BigInt(text), modified: true });
	return { ok: true };
}

export function appendFloat32(fields, fieldNumber, value) {
	const num = Number(value);
	if (isNaN(num)) return { ok: false, error: "Enter a valid number." };
	const tag = (BigInt(fieldNumber) << 3n) | BigInt(WIRE_FIXED32);
	fields.push({ field: fieldNumber, wireType: WIRE_FIXED32, tagBytes: encodeVarint(tag), fixed32: float32ToBytes(num), modified: true });
	return { ok: true };
}

// Promote a WIRE_LEN node from leaf to navigable message in-place.
function ensureMessage(node) {
    if (node.message !== null) return;
    const parsed = tryParse(node.content || new Uint8Array(0));
    console.log(`ensureMessage field:${node.field} content.length:${node.content?.length} parsed:${parsed?.length}`);
    node.message = parsed ? parsed.map(n => classify(n, 0)) : [];
    node.kind = 'message';
    node.modified = true;
}

// Navigate to a node's parent array by field number path.
function parentOf(fields, fieldPath) {
    let current = fields;
    for (const fNum of fieldPath.slice(0, -1)) {
        const node = current.find(n => n.field === fNum);
        if (!node?.message) return null;
        current = node.message;
    }
    return current;
}

/** Delete all nodes matching a label prefix (e.g. '7.4' removes all field:4 under field:7).
 * @param {string | number[]} target row.label | row.label.split('.').map(v => Number(v)) */
export function deleteByLabel(fields, target) {
    const fieldPath = typeof target === 'string' ? target.split('.').map(Number) : target;
    const parent = parentOf(fields, fieldPath);
    if (!parent) return;
    const leafField = fieldPath.at(-1);
    let i = parent.length;
    while (i--) if (parent[i].field === leafField) parent.splice(i, 1);
}

/** Navigate or create by field number path, then set or append the leaf.
 * @param {string | number[]} target row.label | row.label.split('.').map(v => Number(v)) */
export function setOrAppend(decoded, target, kind, value) {
    const fieldPath = typeof target === 'string' ? target.split('.').map(Number) : target;
    
    let currents = [decoded.fields];
    for (const fNum of fieldPath.slice(0, -1)) {
        const next = [];
        for (const current of currents) {
            const nodes = current.filter(n => n.field === fNum);
			//console.log(`fNum:${fNum} found:${current.filter(n => n.field === fNum).length}`);
            if (!nodes.length) { // node missing, create it in this current
                const tag = (BigInt(fNum) << 3n) | BigInt(WIRE_LEN);
                const node = { field: fNum, wireType: WIRE_LEN, tagBytes: encodeVarint(tag),
                               content: new Uint8Array(0), message: [], kind: 'message',
                               modified: true, original: new Uint8Array(0) };
                current.push(node);
                next.push(node.message);
                continue;
            }
            for (const node of nodes) {
                if (node.message === null) {
                    const parsed = tryParse(node.content || new Uint8Array(0));
                    node.message = parsed?.length ? parsed.map(n => classify(n, 0)) : [];
                    node.kind = 'message';
                    node.modified = true;
                }
                next.push(node.message);
            }
        }
        currents = next;
    }
	
	//console.log(`currents after nav: ${currents.length}`);

    const leafField = fieldPath.at(-1);
    for (const current of currents) {
        const nodes = current.filter(n => n.field === leafField);
        if (nodes.length) {
            for (const node of nodes) setValue(current, [current.indexOf(node)], kind, value);
            continue;
        }
        //const res = kind === 'varint' ? appendVarint(current, leafField, value) : appendFloat32(current, leafField, value);
        const res = kind === 'varint'
			? appendVarint(current, leafField, value) : kind === 'string'
				? appendString(current, leafField, value) : appendFloat32(current, leafField, value);
		if (!res.ok) console.warn(`setOrAppend append [${fieldPath}] failed: ${res.error}`);
    }
    return true;
}

/** Append a new empty repeated message under parentLabel, return its field array for chaining. @returns {any[]} */
export function appendMessage(target, label) {
    const fieldPath = typeof label === 'string' ? label.split('.').map(Number) : label;
    const fields = Array.isArray(target) ? target : target.fields;
    
    let current = fields;
    for (const fNum of fieldPath.slice(0, -1)) {
        let node = current.find(n => n.field === fNum);
        if (!node) {
            const tag = (BigInt(fNum) << 3n) | BigInt(WIRE_LEN);
            node = { field: fNum, wireType: WIRE_LEN, tagBytes: encodeVarint(tag),
                     content: new Uint8Array(0), message: [], kind: 'message',
                     modified: true, original: new Uint8Array(0) };
            current.push(node);
        } else if (node.message === null) {
            const parsed = tryParse(node.content || new Uint8Array(0));
            node.message = parsed?.length ? parsed.map(n => classify(n, 0)) : [];
            node.kind = 'message';
            node.modified = true;
        }
        current = node.message;
    }
    const leafField = fieldPath.at(-1);
    const tag = (BigInt(leafField) << 3n) | BigInt(WIRE_LEN);
    const node = { field: leafField, wireType: WIRE_LEN, tagBytes: encodeVarint(tag),
                   content: new Uint8Array(0), message: [], kind: 'message',
                   modified: true, original: new Uint8Array(0) };
    current.push(node);
    return node.message;
}

export function appendString(fields, fieldNumber, value) {
    const tag = (BigInt(fieldNumber) << 3n) | BigInt(WIRE_LEN);
    const content = textEncoder.encode(String(value));
    fields.push({ field: fieldNumber, wireType: WIRE_LEN, tagBytes: encodeVarint(tag),
                  content, message: null, kind: 'string', modified: true, original: new Uint8Array(0) });
    return { ok: true };
}