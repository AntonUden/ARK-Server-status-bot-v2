import Gamedig, { QueryResult } from 'gamedig';
import { rejects } from 'assert';

export interface IServer {
	name: string,
	ip: string,
	port: number
}

export interface IServerStatus {
	online: boolean,
	error?: any,
	result?: QueryResult
}

export default class ServerChecker {
	static checkServer(server: IServer) {
		return new Promise<IServerStatus>(function(resolve, reject) {
			Gamedig.query({
				type: 'arkse',
				host: server.ip,
				port: server.port
			}).then((result: QueryResult) => {
				resolve({
					online: true,
					result: result
				});
			}).catch((error) => {
				resolve({
					online: false,
					error: error
				});
			});
		});
	}
}