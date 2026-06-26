/** Descriptor of labels @type {Record<string, <Record<string, string>>} */
export const DATA_LABEL_DESC = { // row.label based
	'.car': {
		'1.1': 'Total Mass',
		'1.2': 'Sreen Name',
		'1.6': 'Max Fuel',
		'1.10': 'Pickup Front Height',
		'1.11': 'Pickup Rear Height',
		'1.14': 'Torsional Stiffness',
		'1.15': 'Torsional Damping',
		'2.2': 'Wheel Base',
		'2.3': 'Center of gravity',
		'2.50': 'Base Y front',
		'2.51': 'Base Y Rear',
		'2.52': 'Track Front',
		'2.53': 'Track Rear',
		//'2.4.1': 'Damage Min Valocity',	//useless
		//'2.4.2': 'Damage Gain',			//useless
		//'2.4.3': 'Damage Max Damage',		//useless
		'8.1': 'Ff Multi',
		'8.2': 'Steer Lock',
		'8.3': 'Steer Ratio',
		'8.4': 'Linear Steer Rod Ratio',
	},
	'.carsetuplimits': {
		'7.1.3 ': 'Fuel',
	}
}

export const DATA_SPECIAL_COMMENTS = {
	'Center of gravity': 'Rear = 0 | front = 1',
}

export const DATA_KEYS = [ // '.actor',
	'.car',
	'.carsetup',
	'.carsetuplimits',
	'.mechanicalcarpreset'
];