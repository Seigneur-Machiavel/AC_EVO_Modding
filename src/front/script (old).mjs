
// @ts-check

import { PART_KEYS } from '../parts-table.mjs';
import { ModSwap, ModData, ModParts, ModSwapsLib, TyresLib } from '../classes.mjs';
import { DATA_PATH_LABEL_LINKS, DATA_SPECIAL_COMMENTS } from '../data-table.mjs';

/**
 * @typedef {import('../classes.mjs').TyreSet} TyreSet
 * @typedef {import('../classes.mjs').SetOfModParts} SetOfModParts
 * @typedef {import('../classes.mjs').SetOfModSetups} SetOfModSetups
 * @typedef {import('../classes.mjs').SetOfMechTyres} SetOfMechTyres
 */

const store = {
	acePath: '',
	/** Raw ModParts catalog from server by car_id @type {SetOfModParts} */
	mechs: {},
	/** Raw ModData catalog from server by car_id @type {SetOfModSetups} */
	setups: {},
};

/** In-progress edits before "swap it baby!" */
let DRAFTS = new ModSwapsLib();
/** @type {TyresLib} */
let TYRES;
/** @type {SetOfMechTyres} */
let MECHS_TYRES;
/** Current SWAPS from server.*/
let SWAPS = new ModSwapsLib(); 		// @ts-ignore

window.store = store; 				// @ts-ignore
window.SWAPS = SWAPS;

/** car_id keeps its "ks_" prefix everywhere internally; only stripped for display. */
const hideKsPrefix = (carId = 'toto') => carId.startsWith('ks_') ? carId.slice(3) : carId;
let ui = {
	openCar: null, // car_id currently expanded
	openMech: null, // selected mech for the open car
	openPicker: null, // part key currently showing the picker dropdown
};
function notify(message = 'toto', type = 'info') {
	const el = document.createElement('div');
	el.className = `notif ${type}`;
	el.textContent = message;
	document.getElementById('notifs')?.appendChild(el);
	setTimeout(() => el.remove(), 4000);
}

const socket = new WebSocket(`ws://${location.host}`);
function send(type = 'test', /** @type {any} */ payload) { socket.send(JSON.stringify({ type, payload })); }
socket.onmessage = (/** @type {any} */ event) => {
	let msg;
	try { msg = JSON.parse(event.data); }
	catch { return notify(`Bad message from server: ${event.data}`, 'error'); }
	handleServerMessage(msg);
};

socket.onclose = () => notify('Connection to local server lost.', 'error');

/** Expected message shapes from the server:
 * { type: 'path_result', ok: boolean, path: string, reason?: string }
 * { type: 'swap_result', ok: boolean, car_id: string, mech: string, reason?: string } */
function handleServerMessage(/** @type {any} */ msg) {
	if (msg.type === 'init') {
		store.acePath = msg.ace_mods_path || '';
		store.mechs = msg.MECHS || {};
		store.setups = msg.SETUPS || {};
		MECHS_TYRES = msg.MECHS_TYRES || {};
		TYRES = new TyresLib(msg.TYRES);
		if (msg.SWAPS) SWAPS = new ModSwapsLib(msg.SWAPS);

		// @ts-ignore
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

// @ts-ignore
document.getElementById('path-save').onclick = () => { // @ts-ignore
	const value = document.getElementById('path-input').value.trim();
	send('set_ace_mods_path', { path: value });
}; // @ts-ignore
document.getElementById('car-search').oninput = renderCarList;
document.addEventListener('keydown', (e) => { // @ts-ignore
	if (e.key !== '/' || document.activeElement.tagName === 'INPUT') return;
	e.preventDefault(); // @ts-ignore
	document.getElementById('car-search').focus();
});
function renderCarList() { // @ts-ignore
	const search = document.getElementById('car-search').value.trim().toLowerCase();
	const listEl = document.getElementById('car-list'); // @ts-ignore
	listEl.innerHTML = '';

	const carIds = Object.keys(store.mechs)
		.filter((id) => id.toLowerCase().includes(search))
		.sort((a, b) => hideKsPrefix(a).localeCompare(hideKsPrefix(b))); // @ts-ignore
	document.getElementById('car-count').textContent = `${carIds.length} car${carIds.length === 1 ? '' : 's'}`;
	// @ts-ignore
	if (carIds.length === 0) listEl.innerHTML = '<p class="empty">No car matches your search.</p>'; // @ts-ignore
	else for (const carId of carIds) listEl.appendChild(buildCarRow(carId));
}
function buildCarRow(carId = 'toto') {
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
function buildMechTags(carId = 'toto') {
	const mechs = Object.keys(store.mechs[carId]);
	if (mechs.length === 0) return '<span class="mech-tag none">no variant</span>';
	return mechs.map((m) => `<span class="mech-tag">${m}</span>`).join('');
}
function toggleCar(carId = 'toto') {
	ui = { // @ts-ignore
		openCar: 	ui.openCar === carId ? null : carId, // @ts-ignore
		openMech: 	ui.openCar === carId ? null : Object.keys(store.mechs[carId])[0], // firstMech
		openPicker: null
	};
	renderCarList();
}

function buildSwapPanel(carId = 'toto') {
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
function buildMechSelect(carId = 'toto') {
	const mechSelect = document.createElement('div');
	mechSelect.className = 'mech-select';
	for (const mech of Object.keys(store.mechs[carId])) {
		const btn = document.createElement('button');
		btn.className = `mech-btn ${mech === ui.openMech ? 'active' : ''}`;
		btn.textContent = mech; // @ts-ignore
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
function buildPartList(carId = 'toto') {
	const partList = document.createElement('div');
	partList.className = 'part-list'; // @ts-ignore
	for (const key of PART_KEYS) partList.appendChild(buildPartRow(carId, ui.openMech, key));
	return partList;
}
function buildSwapPanelButtons(carId = 'toto') {
	const actions = document.createElement('div');
	actions.className = 'swap-actions';
	const swapBtn = document.createElement('button');
	swapBtn.className = 'btn-pink';
	swapBtn.textContent = 'swap it baby! 🦜'; // @ts-ignore
	swapBtn.onclick = () => confirmSwap(carId, ui.openMech);
	actions.appendChild(swapBtn);
	return actions;
}

/** Resolve the current value for a data path: draft > applied swap > origin. */
function getSpecValue(carId = 'toto', mech = 'mech_1', fileExt = '.car', path = 'C:/...') {
	const draft = DRAFTS.get(carId, mech)?.setup.get(fileExt, path);
	if (draft !== undefined) return draft;

	const applied = SWAPS.get(carId, mech)?.setup.get(fileExt, path);
	if (applied !== undefined) return applied;
	// @ts-ignore he is here.
	return store.setups[carId]?.[mech]?.[fileExt]?.[path];
}
function getOriginSpecValue(carId = 'toto', mech = 'mech_1', fileExt = '.car', path = 'C:/...') { // @ts-ignore
	return store.setups[carId]?.[mech]?.[fileExt]?.[path];
}
function isSpecDrafted(carId = 'toto', mech = 'mech_1', fileExt = '.car', path = 'C:/...') {
	return DRAFTS.get(carId, mech)?.setup.get(fileExt, path);
}
function setDraftSpec(carId = 'toto', mech = 'mech_1', fileExt = '.car', path = 'C:/...', /** @type {any} */ value) {
	if (!DRAFTS.get(carId, mech)) DRAFTS.set(carId, mech); // init new
	DRAFTS.get(carId, mech)?.setup.set(fileExt, path, value);
}
function resetSpecToOrigin(carId = 'toto', mech = 'toto', fileExt = 'toto', path = 'toto') {
	setDraftSpec(carId, mech, fileExt, path, getOriginSpecValue(carId, mech, fileExt, path));
}
function buildSpecsList(carId = 'toto', fileExt = 'toto') {
	const specsList = document.createElement('div');
	specsList.className = 'specs-list';

	specsList.appendChild(buildRealisticCheckbox());

	for (const path in DATA_PATH_LABEL_LINKS[fileExt]) // @ts-ignore
		specsList.appendChild(buildSpecRow(carId, ui.openMech, fileExt, path));

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
function buildSpecRow(carId = 'toto', mech = 'toto', fileExt = 'toto', path = 'toto') {
	const row = document.createElement('div');
	row.className = 'spec-row';

	const label = document.createElement('span'); // @ts-ignore
	const desc = DATA_PATH_LABEL_LINKS[fileExt][path];
	label.className = 'spec-label'; // @ts-ignore
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
function buildSpecsResetAllButton(carId = 'toto', fileExt = 'toto') {
	const resetAllBtn = document.createElement('button');
	resetAllBtn.className = 'btn-ghost specs-reset-all';
	resetAllBtn.textContent = 'reset all';
	resetAllBtn.onclick = () => { // @ts-ignore
		for (const path in DATA_PATH_LABEL_LINKS[fileExt]) resetSpecToOrigin(carId, ui.openMech, fileExt, path);
		renderCarList();
	};
	return resetAllBtn;
}

function buildPartRow(carId = 'toto', mech = 'toto', key = 'toto') {
	const row = document.createElement('div');
	row.className = 'part-row';

	const draft = DRAFTS.get(carId, mech)?.getPart(key);
	const applied = SWAPS.get(carId, mech)?.getPart(key);
	const ref = draft || applied ? draft || applied : null;

	const sourceLabel = ref?.car_id ? `${hideKsPrefix(ref.car_id)} (${ref.mech})`: 'unchanged';
	const sourceClass = draft ? 'pending' : applied ? 'applied' : '';

	row.innerHTML = `<span class="part-key">${key}</span><span class="part-source ${sourceClass}">${sourceLabel}</span>`;
	row.onclick = (e) => {
		e.stopPropagation(); // @ts-ignore
		ui.openPicker = ui.openPicker === key ? null : key;
		renderCarList();
	};

	if (ui.openPicker === key) row.appendChild(buildPicker(carId, mech, key));

	return row;
}
function buildPicker(carId = 'toto', mech = 'toto', key = 'toto') {
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
function buildPickerItem(carId = 'toto', mech = 'toto', key = 'toto', donorId = 'toto', donorMech = 'toto') {
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
function applyPartDraft(carId = 'toto', mech = 'toto', key = 'toto', donorId = 'toto', donorMech = 'toto') {
	setDraftPart(carId, mech, key, donorId, donorMech);
	ui.openPicker = null;
	renderCarList();
}
function applyAllPartsDraft(carId = 'toto', mech = 'toto', donorId = 'toto', donorMech = 'toto') {
	for (const key of PART_KEYS) setDraftPart(carId, mech, key, donorId, donorMech);
	ui.openPicker = null;
	renderCarList();
	notify(`All parts staged from ${hideKsPrefix(donorId)} (${donorMech}). Hit "swap it baby!" to confirm.`, 'info');
}
function setDraftPart(carId = 'toto', mech = 'toto', key = 'toto', donorId = 'toto', donorMech = 'toto') {
	const draft = DRAFTS.get(carId, mech) || new ModSwap();
	draft.parts[key] = { car_id: donorId, mech: donorMech };
	DRAFTS.set(carId, mech, draft);
}

function confirmSwap(carId = 'toto', mech = 'toto') {
	const draft = DRAFTS.get(carId, mech);
	if (!draft) return notify('No part has been changed for this mech yet.', 'error');

	const modSwap = buildModSwapFromDraft(carId, mech, draft);
	send('update_swap_and_build', { car_id: carId, mech, mod_swap: modSwap });

	SWAPS.set(carId, mech, modSwap);
	DRAFTS.delete(carId, mech);
	renderCarList();
}
function buildModSwapFromDraft(carId = 'toto', mech = 'toto', draft = new ModSwap()) {
	// MERGE
	const modSwap = new ModSwap();
	const base = SWAPS.get(carId, mech) || new ModSwap();
	for (const fileExt in base.setup) // @ts-ignore
		for (const valuePath in base.setup[fileExt] || {}) {
			const val = base.setup.get(fileExt, valuePath);
			if (val) modSwap.setup.set(fileExt, valuePath, val);
		}

	for (const fileExt in draft.setup) // @ts-ignore
		for (const valuePath in draft.setup[fileExt] || {}) {
			const val = draft.setup.get(fileExt, valuePath);
			if (val) modSwap.setup.set(fileExt, valuePath, val);
		}

	for (const key of PART_KEYS) modSwap.parts[key] = draft.parts[key] || base.parts[key];
	for (const key of PART_KEYS) if (!modSwap.parts[key]) delete modSwap.parts[key]; // clear if empty
	return modSwap;
}
