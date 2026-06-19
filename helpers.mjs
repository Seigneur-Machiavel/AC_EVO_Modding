// @ts-check
import fs from "fs";
import path from 'path';

export class Logger {
	/** @type {string[]} */ logs = [];

	log(message = 'toto', logToConsole = true) {
		this.logs.push(message);
		if (logToConsole) console.log(message);
	};
}

export class FileSystem {
	/** @param {string | NodeJS.ArrayBufferView} content */
	static writeFileSync(p = 'C:', content) { fs.writeFileSync(p, content); }
	static readFileSync(p = 'C:') { return fs.readFileSync(p); }
	static createDirIfNot(p = 'C:') { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
	static removeDirIfExist(p = 'C:') { if (fs.existsSync(p)) fs.rmSync(p, { recursive: true }); }

	/** List files (not dirs) in a folder, sorted. Returns [] if dir is null/missing. */
	static listFiles(p = 'C:') {
		if (!p || !fs.existsSync(p)) return [];
		return fs.readdirSync(p).filter(f => fs.statSync(path.join(p, f)).isFile()).map(f => f.toLowerCase()).sort();
	}

	/** List subdirs in a folder, sorted. Returns [] if dir is null/missing. */
	static listDirs(p = 'C:') {
		if (!p || !fs.existsSync(p)) return [];
		return fs.readdirSync(p).filter(f => fs.statSync(path.join(p, f)).isDirectory()).sort();
	}

	/** @param {string} [destFileNameMod] */
	static copyFile(file = 'toto.js', p = 'C:', dest = 'D:', destFileNameMod) {
		const read = this.readFileSync(path.join(p, file));
		this.createDirIfNot(dest);
		const fName = !destFileNameMod ? file : `${file.split('.')[0]}${destFileNameMod}.${file.split('.')[1]}`
		this.writeFileSync(path.join(dest, fName), read);
	}

	/** @param {string} [destFileNameMod] */
	static copyDir(p = 'C:', dest = 'D:', destFileNameMod) {
		for (const folder of this.listDirs(p)) // recursive
			this.copyDir(path.join(p, folder), path.join(dest, folder), destFileNameMod);

		for (const file of this.listFiles(p)) this.copyFile(file, p, dest, destFileNameMod);
	}
}

// USELESS
function encodeProtoVarint(/** @type {any} */ value) {
  let v = BigInt(value);
  const bytes = [];
  do {
	let byte = Number(v & 0x7fn);
	v >>= 7n;
	if (v > 0n) byte |= 0x80;
	bytes.push(byte);
  } while (v > 0n);
  return Buffer.from(bytes);
}
function protoTag(/** @type {any} */ field, /** @type {any} */ wire) {
  return encodeProtoVarint((BigInt(field) << 3n) | BigInt(wire));
}
function protoString(/** @type {any} */ field, /** @type {any} */ value) {
  const bytes = Buffer.from(String(value || ""), "utf8");
  return Buffer.concat([protoTag(field, 2), encodeProtoVarint(bytes.length), bytes]);
}
function protoInt(/** @type {any} */ field, /** @type {any} */ value) {
  return Buffer.concat([protoTag(field, 0), encodeProtoVarint(value)]);
}
function protoMessage(/** @type {any} */ field, /** @type {any} */ body) {
  return Buffer.concat([protoTag(field, 2), encodeProtoVarint(body.length), body]);
}