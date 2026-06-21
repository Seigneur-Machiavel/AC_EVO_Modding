/*export const DATA_PATH_LABEL_LINKS = {
	'.car': {
		'1.1': 'Total Mass',
		'1.2': 'Sreen Name',
		'1.5': 'Fuel',
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
		'2.4.1': 'Damage Min Valocity',
		'2.4.2': 'Damage Gain',
		'2.4.3': 'Damage Max Damage',
		'8.1': 'Ff Multi',
		'8.2': 'Steer Lock',
		'8.3': 'Steer Ratio',
		'8.4': 'Linear Steer Rod Ratio',
	}
}*/
export const DATA_PATH_LABEL_LINKS = {
	'.car': {
		'0,0': 'Total Mass',
		'0,1': 'Sreen Name',
		'0,3': 'Fuel',
		'0,4': 'Max Fuel',
		'0,7': 'Pickup Front Height',
		'0,8': 'Pickup Rear Height',
		'0,9': 'Torsional Stiffness',
		'0,10': 'Torsional Damping',
		'1,0': 'Wheel Base',
		'1,1': 'Center of gravity',
		'1,15': 'Base Y front',
		'1,16': 'Base Y Rear',
		'1,17': 'Track Front',
		'1,18': 'Track Rear',
		'1,2,0': 'Damage Min Valocity',
		'1,2,1': 'Damage Gain',
		'1,2,2': 'Damage Max Damage',
		'7,0': 'Ff Multi',
		'7,1': 'Steer Lock',
		'7,2': 'Steer Ratio',
		'7,3': 'Linear Steer Rod Ratio',
		//'1,5,0': 'Arb Front Stiffness', // NOT SURE!
		//'1,5,1': 'Arb Rear Stiffness',  // NOT SURE!
	},
	// '.mechanicalcarpreset' // -> tyres (probably useless)
	// presets/.compatibletyres // -> tyres
}

export const DATA_SPECIAL_COMMENTS = {
	'Center of gravity': 'Rear = 0 | front = 1',
}

export const DATA_LABEL_PATH_LINKS = {}; // TODO

export const DATA_KEYS = [ // '.actor',
	'.car',
	'.mechanicalcarpreset',
	'.carsetup',
	'.carsetuplimits'
];