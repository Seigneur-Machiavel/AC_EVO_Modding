// ---------- STORE ----------
// SWAPS shape: { [car_id]: { [mech]: ModSwap } }
// ModSwap shape: each part key maps to { car_id, mech } (a reference, not a path).
// The actual path is resolved through store.mechs[car_id][mech][part] at render time.
// PART_KEYS only covers swappable file-path parts for now.
// Future fields like weight or power distribution will need their own row type,
// since they won't be "pick from a donor car" but raw value edits.
import { PART_KEYS } from '../parts-table.mjs';
import { DATA_PATH_LABEL_LINKS, DATA_SPECIAL_COMMENTS } from '../data-table.mjs';
//const PART_KEYS = ['.drivetrain', '.gearbox', '.clutch', '.carengine', '.brakesystem', 'front.coilover', 'rear.coilover', 'front.suspension', 'rear.suspension'];

const store = {
	acePath: '',
	mechs: {}, // raw catalog from server: { car_id: { mech: ModParts } }
	setups: {}, // raw ModData catalog from server: { car_id: { mech: ModData } }
	swaps: {}, // current SWAPS from server: { car_id: { mech: ModSwap } }
	drafts: {}, // in-progress edits before "swap it baby!": { car_id: { mech: ModSwap } }
};

/** car_id keeps its "ks_" prefix everywhere internally; only stripped for display. */
const hideKsPrefix = (carId) => carId.startsWith('ks_') ? carId.slice(3) : carId;
window.store = store; 				// expose for debugging
let ui = {
	openCar: null, // car_id currently expanded
	openMech: null, // selected mech for the open car
	openPicker: null, // part key currently showing the picker dropdown
};
function notify(message, type = 'info') {
	const el = document.createElement('div');
	el.className = `notif ${type}`;
	el.textContent = message;
	document.getElementById('notifs').appendChild(el);
	setTimeout(() => el.remove(), 4000);
}

// ---------- WEBSOCKET ----------
const socket = new WebSocket(`ws://${location.host}`);
function send(type, payload) { socket.send(JSON.stringify({ type, payload })); }
socket.onmessage = (event) => {
	let msg;
	try { msg = JSON.parse(event.data); }
	catch { return notify(`Bad message from server: ${event.data}`, 'error'); }

	handleServerMessage(msg);
};

socket.onclose = () => notify('Connection to local server lost.', 'error');

/** Expected message shapes from the server:
 * { type: 'init', ace_mods_path: string, mechs: Record<car_id, Record<mech, ModParts>>, setups: Record<car_id, Record<mech, ModData>>, swaps: Record<car_id, Record<mech, ModSwap>> }
 * { type: 'path_result', ok: boolean, path: string, reason?: string }
 * { type: 'swap_result', ok: boolean, car_id: string, mech: string, reason?: string } */
function handleServerMessage(msg) {
	if (msg.type === 'init') {
		store.acePath = msg.ace_mods_path || '';
		store.mechs = msg.mechs || {};
		store.setups = msg.setups || {};
		store.swaps = msg.swaps || {};
		document.getElementById('path-input').value = store.acePath;
		renderCarList();
		return;
	}

	if (msg.type === 'path_result') {
		if (msg.ok) notify(`Path validated: ${msg.path}`, 'ok');
		else notify(`Invalid path: ${msg.reason || 'unknown reason'}`, 'error');
		return;
	}

	if (msg.type === 'swap_result') {
		if (msg.ok) notify(`${msg.car_id} (${msg.mech}) swapped and built!`, 'ok');
		else notify(`Swap failed for ${msg.car_id}: ${msg.reason || 'unknown reason'}`, 'error');
		return;
	}

	notify(`Unknown message type: ${msg.type}`, 'error');
}

// 
document.getElementById('path-save').onclick = () => {
	const value = document.getElementById('path-input').value.trim();
	send('set_ace_mods_path', { path: value });
};
document.getElementById('car-search').oninput = renderCarList;
document.addEventListener('keydown', (e) => {
	if (e.key !== '/' || document.activeElement.tagName === 'INPUT') return;
	e.preventDefault();
	document.getElementById('car-search').focus();
});
function renderCarList() {
	const search = document.getElementById('car-search').value.trim().toLowerCase();
	const listEl = document.getElementById('car-list');
	listEl.innerHTML = '';

	const carIds = Object.keys(store.mechs)
		.filter((id) => id.toLowerCase().includes(search))
		.sort((a, b) => hideKsPrefix(a).localeCompare(hideKsPrefix(b)));
	document.getElementById('car-count').textContent = `${carIds.length} car${carIds.length === 1 ? '' : 's'}`;

	if (carIds.length === 0) listEl.innerHTML = '<p class="empty">No car matches your search.</p>';
	else for (const carId of carIds) listEl.appendChild(buildCarRow(carId));
}
function buildCarRow(carId) {
	const row = document.createElement('div');
	row.className = 'car-row';

	const head = document.createElement('div');
	head.className = 'car-head';
	head.innerHTML = `<span class="car-name">${hideKsPrefix(carId)}</span><span class="mech-tags">${buildMechTags(carId)}</span>`;
	head.onclick = () => toggleCar(carId);
	row.appendChild(head);

	if (ui.openCar === carId) row.appendChild(buildSwapPanel(carId));

	return row;
}
function buildMechTags(carId) {
	const mechs = Object.keys(store.mechs[carId]);
	if (mechs.length === 0) return '<span class="mech-tag none">no variant</span>';
	return mechs.map((m) => `<span class="mech-tag">${m}</span>`).join('');
}
function toggleCar(carId) {
	ui = {
		openCar: 	ui.openCar === carId ? null : carId,
		openMech: 	ui.openCar === carId ? null : Object.keys(store.mechs[carId])[0], // firstMech
		openPicker: null
	};
	renderCarList();
}

// ---------- SWAP PANEL ----------
function buildSwapPanel(carId) {
	const panel = document.createElement('div');
	panel.className = 'swap-panel';

	panel.appendChild(buildMechSelect(carId));
	panel.appendChild(buildSectionTitle('CAR SPECS'));
	panel.appendChild(buildSpecsList(carId, '.car'));
	panel.appendChild(buildSectionTitle('PARTS'));
	panel.appendChild(buildPartList(carId));
	panel.appendChild(buildSwapPanelButtons(carId));

	return panel;
}
function buildMechSelect(carId) {
	const mechSelect = document.createElement('div');
	mechSelect.className = 'mech-select';
	for (const mech of Object.keys(store.mechs[carId])) {
		const btn = document.createElement('button');
		btn.className = `mech-btn ${mech === ui.openMech ? 'active' : ''}`;
		btn.textContent = mech;
		btn.onclick = () => { ui.openMech = mech; ui.openPicker = null; renderCarList(); };
		mechSelect.appendChild(btn);
	}
	return mechSelect;
}
function buildSectionTitle(section = 'PARTS') {
	const sectionTitle = document.createElement('h2');
	sectionTitle.textContent = section;
	sectionTitle.style = 'text-align: center;';
	return sectionTitle;
}
function buildPartList(carId) {
	const partList = document.createElement('div');
	partList.className = 'part-list';
	for (const key of PART_KEYS) partList.appendChild(buildPartRow(carId, ui.openMech, key));
	return partList;
}
function buildSwapPanelButtons(carId) {
	const actions = document.createElement('div');
	actions.className = 'swap-actions';
	const swapBtn = document.createElement('button');
	swapBtn.className = 'btn-pink';
	swapBtn.textContent = 'swap it baby! 🦜';
	swapBtn.onclick = () => confirmSwap(carId, ui.openMech);
	actions.appendChild(swapBtn);
	return actions;
}

// ---------- CAR SETUP ----------
/** Resolve the current value for a data path: draft > applied swap > origin. */
function getSpecValue(carId, mech, fileExt, path) {
	const draft = store.drafts[carId]?.[mech]?.setup?.[fileExt]?.[path];
	if (draft !== undefined) return draft;

	const applied = store.swaps[carId]?.[mech]?.setup?.[fileExt]?.[path];
	if (applied !== undefined) return applied;

	return store.setups[carId]?.[mech]?.[fileExt]?.[path];
}
function getOriginSpecValue(carId, mech, fileExt, path) {
	return store.setups[carId]?.[mech]?.[fileExt]?.[path];
}
function isSpecDrafted(carId, mech, fileExt, path) {
	return store.drafts[carId]?.[mech]?.setup?.[fileExt]?.[path] !== undefined;
}
function setDraftSpec(carId, mech, fileExt, path, value) {
	store.drafts[carId] ??= {};
	store.drafts[carId][mech] ??= { setup: {} };
	store.drafts[carId][mech].setup[fileExt] ??= {};
	store.drafts[carId][mech].setup[fileExt][path] = value;
}
function resetSpecToOrigin(carId, mech, fileExt, path) {
	setDraftSpec(carId, mech, fileExt, path, getOriginSpecValue(carId, mech, fileExt, path));
}
function buildSpecsList(carId, fileExt) {
	const specsList = document.createElement('div');
	specsList.className = 'specs-list';

	specsList.appendChild(buildRealisticCheckbox());

	for (const path in DATA_PATH_LABEL_LINKS[fileExt]) specsList.appendChild(buildSpecRow(carId, ui.openMech, fileExt, path));

	specsList.appendChild(buildSpecsResetAllButton(carId, fileExt));

	return specsList;
}
function buildRealisticCheckbox() {
	const wrapper = document.createElement('label');
	wrapper.className = 'realistic-toggle';

	const checkbox = document.createElement('input');
	checkbox.type = 'checkbox';
	checkbox.checked = false;
	checkbox.disabled = true; // placeholder until we have an estimation table

	wrapper.appendChild(checkbox);
	wrapper.append(' Make it realistic');

	return wrapper;
}
function buildSpecRow(carId, mech, fileExt, path) {
	const row = document.createElement('div');
	row.className = 'spec-row';

	const label = document.createElement('span');
	const desc = DATA_PATH_LABEL_LINKS[fileExt][path];
	label.className = 'spec-label';
	label.innerHTML = !DATA_SPECIAL_COMMENTS[desc] ? desc : `${desc} <span style="opacity: .8">(${DATA_SPECIAL_COMMENTS[desc]})<span>`;
	row.appendChild(label);

	const input = document.createElement('input');
	input.type = 'text';
	input.className = `spec-input ${isSpecDrafted(carId, mech, fileExt, path) ? 'pending' : ''}`;
	input.value = getSpecValue(carId, mech, fileExt, path) ?? '';
	input.onchange = () => { setDraftSpec(carId, mech, fileExt, path, input.value); renderCarList(); };
	row.appendChild(input);

	const defaultBtn = document.createElement('button');
	defaultBtn.className = 'btn-ghost';
	defaultBtn.textContent = 'default';
	defaultBtn.onclick = () => { resetSpecToOrigin(carId, mech, fileExt, path); renderCarList(); };
	row.appendChild(defaultBtn);

	return row;
}
function buildSpecsResetAllButton(carId, fileExt) {
	const resetAllBtn = document.createElement('button');
	resetAllBtn.className = 'btn-ghost specs-reset-all';
	resetAllBtn.textContent = 'reset all';
	resetAllBtn.onclick = () => {
		for (const path in DATA_PATH_LABEL_LINKS[fileExt]) resetSpecToOrigin(carId, ui.openMech, fileExt, path);
		renderCarList();
	};
	return resetAllBtn;
}

// ---------- PARTS ----------
function buildPartRow(carId, mech, key) {
	const row = document.createElement('div');
	row.className = 'part-row';

	const draft = store.drafts[carId]?.[mech]?.[key];
	const applied = store.swaps[carId]?.[mech]?.[key];
	const ref = draft || applied ? draft || applied : null;

	const sourceLabel = ref?.car_id ? `${hideKsPrefix(ref.car_id)} (${ref.mech})`: 'unchanged';
	const sourceClass = draft ? 'pending' : applied ? 'applied' : '';

	row.innerHTML = `<span class="part-key">${key}</span><span class="part-source ${sourceClass}">${sourceLabel}</span>`;
	row.onclick = (e) => {
		e.stopPropagation();
		ui.openPicker = ui.openPicker === key ? null : key;
		renderCarList();
	};

	if (ui.openPicker === key) row.appendChild(buildPicker(carId, mech, key));

	return row;
}
function buildPicker(carId, mech, key) {
	const picker = document.createElement('div');
	picker.className = 'part-picker';
	picker.onclick = (e) => e.stopPropagation();

	const search = document.createElement('input');
	search.type = 'text';
	search.placeholder = 'Search a donor car...';
	picker.appendChild(search);

	const list = document.createElement('div');
	list.className = 'picker-list';
	picker.appendChild(list);

	const renderOptions = () => {
		const term = search.value.trim().toLowerCase();
		list.innerHTML = '';

		for (const donorId of Object.keys(store.mechs).filter((id) => id.toLowerCase().includes(term)).sort((a, b) => hideKsPrefix(a).localeCompare(hideKsPrefix(b))))
			for (const donorMech of Object.keys(store.mechs[donorId]))
				list.appendChild(buildPickerItem(carId, mech, key, donorId, donorMech));
	};

	search.oninput = renderOptions;
	renderOptions();

	return picker;
}
function buildPickerItem(carId, mech, key, donorId, donorMech) {
	const item = document.createElement('div');
	item.className = 'picker-item';

	const label = document.createElement('span');
	label.textContent = `${hideKsPrefix(donorId)} (${donorMech})`;
	item.appendChild(label);

	const btnGroup = document.createElement('span');

	const assignPart = document.createElement('button');
	assignPart.className = 'btn-ghost';
	assignPart.textContent = 'assign part';
	assignPart.onclick = () => applyPartDraft(carId, mech, key, donorId, donorMech);
	btnGroup.appendChild(assignPart);

	const assignAll = document.createElement('button');
	assignAll.className = 'btn-green';
	assignAll.textContent = 'assign all parts';
	assignAll.style.marginLeft = '0.4rem';
	assignAll.onclick = () => applyAllPartsDraft(carId, mech, donorId, donorMech);
	btnGroup.appendChild(assignAll);

	item.appendChild(btnGroup);
	return item;
}
function applyPartDraft(carId, mech, key, donorId, donorMech) {
	setDraftPart(carId, mech, key, donorId, donorMech);
	ui.openPicker = null;
	renderCarList();
}
function applyAllPartsDraft(carId, mech, donorId, donorMech) {
	for (const key of PART_KEYS) setDraftPart(carId, mech, key, donorId, donorMech);
	ui.openPicker = null;
	renderCarList();
	notify(`All parts staged from ${hideKsPrefix(donorId)} (${donorMech}). Hit "swap it baby!" to confirm.`, 'info');
}
function setDraftPart(carId, mech, key, donorId, donorMech) {
	store.drafts[carId] ??= {};
	store.drafts[carId][mech] ??= {};
	store.drafts[carId][mech][key] = { car_id: donorId, mech: donorMech };
}

// ---------- SWAP CONFIRMATION ----------
function confirmSwap(carId, mech) {
	const draft = store.drafts[carId]?.[mech];
	if (!draft) return notify('No part has been changed for this mech yet.', 'error');

	const modSwap = buildModSwapFromDraft(carId, mech, draft);
	send('update_swap_and_build', { car_id: carId, mech, mod_swap: modSwap });

	store.swaps[carId] ??= {};
	store.swaps[carId][mech] = modSwap;
	delete store.drafts[carId][mech];
	renderCarList();
}
function buildModSwapFromDraft(carId, mech, draft) {
	const base = store.swaps[carId]?.[mech] || {};
	const modSwap = { setup: { ...base.setup, ...draft.setup } };
	for (const key of PART_KEYS) modSwap[key] = draft[key] || base[key];
	for (const key of PART_KEYS) if (!modSwap[key]) delete modSwap[key]; // clear if empty
	return modSwap;
}
