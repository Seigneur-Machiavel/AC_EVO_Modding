// @ts-check
import path from "path";
import { Logger, FileSystem, resolveFileIdentity } from './helpers.mjs';

const CARS_DIR = 'D:\\_Projects\\ACEvo.Package\\content.extracted\\content\\cars';
const TYRES_DIR = path.join(CARS_DIR, 'common_phsx', 'tyres');
export function extract_all_tyres() {
	/** @type {Record<string, Record<string, string>>} */
	const TYRES = {};
	const categories = FileSystem.listDirs(TYRES_DIR);
	for (const category of categories) {

		const files = FileSystem.listFiles(path.join(TYRES_DIR, category));
		for (const file of files) {
			if (!file.endsWith('.tyre')) continue;

			if (!TYRES[category]) TYRES[category] = {};
			const pathToTyre = path.join('content', 'cars', 'common_phsx', 'tyres', category, file);
			TYRES[category][file.replace('.tyre', '')] = pathToTyre;
		}
	}

	return TYRES;
}