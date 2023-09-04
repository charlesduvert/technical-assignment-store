import { JSONArray, JSONObject, JSONPrimitive } from "./json-types";

import 'reflect-metadata';

export type Permission = "r" | "w" | "rw" | "none";

export type StoreResult = Store | JSONPrimitive | undefined;

export type StoreValue =
	| JSONObject
	| JSONArray
	| StoreResult
	| (() => StoreResult);

export interface IStore {
	defaultPolicy: Permission;
	allowedToRead(key: string): boolean;
	allowedToWrite(key: string): boolean;
	read(path: string): StoreResult;
	write(path: string, value: StoreValue): StoreValue;
	writeEntries(entries: JSONObject): void;
	entries(): JSONObject;
}

const RESTRICT_DECORATOR_KEY = 'restrict-decorator-key';

export function Restrict(permission: Permission | string	= ''): any {
	return function (target: any, propertyKey: string) {
		Reflect.defineMetadata(RESTRICT_DECORATOR_KEY, permission, target, propertyKey);
	};
}

export class Store implements IStore {
	defaultPolicy: Permission = "rw";
	[key: string]: any;

	allowedToRead(key: string): boolean {
		const permission = Reflect.getMetadata(RESTRICT_DECORATOR_KEY, this, key) || this.defaultPolicy;
		return permission.includes('r');
	}

	allowedToWrite(key: string): boolean {
		const permission = Reflect.getMetadata(RESTRICT_DECORATOR_KEY, this, key) || this.defaultPolicy;
		return permission.includes('w');
	}

	read(path: string): StoreResult {
		const keys = path.split(':');
		let current = this;

		keys.forEach((elem) => {
			if(current instanceof Store && !current.allowedToRead(elem)){
				throw new Error(`Unable to read the property - Read permission is missing to access : '${elem}'`);
			}
			if (typeof current[elem] === 'function') {
				current = current[elem]();
			}else{
				current = current[elem];
			}
		});

		return current as StoreResult;
	}

	write(path: string, value: StoreValue): StoreValue {
		if(typeof value === 'object'){
			const store = new Store();
			for (const [key, val] of Object.entries(value as JSONObject)) {
				store.write(key, val as StoreValue);
			}
			value = store;
		}


		const paths = path.split(':'),
			keys = paths.slice(0, paths.length - 1),
			lastKey = paths[paths.length - 1];

		let current = this;

		keys.forEach((elem, index) => {
			if (index === keys.length - 1 && !current.allowedToWrite(elem)){
				throw new Error(`Unable to write the property - Write permission is missing to access : ${lastKey}`);
			}
			if (!current[elem]){
				current[elem] = new Store();
			}

			current = current[elem];
		}); 
		
		if(!current.allowedToWrite(lastKey)){
			throw new Error(`Unable to write the property - Write permission is missing to access : ${lastKey}`);
		}

		current[lastKey] = value;
		
		return value as StoreValue;
	}

	writeEntries(entries: JSONObject): void {
		for(const [key, value] of Object.entries(entries)){
			this.write(key, value);
		}
	}

	entries(): JSONObject {
		const entries: JSONObject = {};

		for(const [key, value] of Object.entries(this)){
			if(!this.allowedToRead(key)) continue;
			entries[key] = value;
		}

		return entries;
	}
}
