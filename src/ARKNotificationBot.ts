import Discord, { Client, Message } from 'discord.js'
import ServerChecker, { IServer, IServerStatus } from './ServerChecker';
import { setInterval } from 'timers';
import FS from 'fs';

export interface ICheckResult {
	server: IServer,
	status: IServerStatus
}

export interface INotification {
	type: NotificationType,
	message: string
}

export enum NotificationType {
	SERVER_UP, SERVER_DOWN, PLAYER_JOIN, PLAYER_LEAVE
}

export default class ARKNotificationBot {
	private _client: Client;
	private _servers: IServer[];
	private _notificationUsers: string[];

	private _oldResult: ICheckResult[];
	private _oldPlayers: { [key: string]: string[] };

	public static INSTANCE: ARKNotificationBot;

	constructor(token: string, servers: IServer[], scanInterval: number) {
		ARKNotificationBot.INSTANCE = this;
		this._client = new Discord.Client();
		this._servers = servers;
		this._oldPlayers = {};
		this._notificationUsers = [];

		if (FS.existsSync('./data.json')) {
			this.loadData();
		} else {
			this.saveData();
		}

		this._client.login(token);

		this._client.on('ready', () => {
			console.log(`Logged in as ${this._client.user.tag}!`);
		});

		this._client.on('message', async function (msg: Message) {
			if (msg.author.bot) {
				return;
			}

			if (msg.content.toLocaleLowerCase().startsWith('!notifications ') || msg.content.toLocaleLowerCase() == '!notifications') {
				let msgParts: string[] = msg.content.toLocaleLowerCase().split(' ');
				if (msgParts.length > 1) {
					if (msgParts[1].toLocaleLowerCase() == 'enable') {
						if (ARKNotificationBot.INSTANCE._notificationUsers.includes(msg.author.id)) {
							msg.reply('Notifications already enabled');
						} else {
							msg.reply('Notifications enabled');
							ARKNotificationBot.INSTANCE._notificationUsers.push(msg.author.id);
							ARKNotificationBot.INSTANCE.saveData();
						}

						return;
					} else if (msgParts[1].toLocaleLowerCase() == 'disable') {
						if (ARKNotificationBot.INSTANCE._notificationUsers.includes(msg.author.id)) {
							var index: number = ARKNotificationBot.INSTANCE._notificationUsers.indexOf(msg.author.id);
							if (index !== -1) {
								ARKNotificationBot.INSTANCE._notificationUsers.splice(index, 1);
								ARKNotificationBot.INSTANCE.saveData();
							}
							msg.reply('Notifications disabled');
						} else {
							msg.reply('Notifications already disabled');
						}

						return;
					}
				}

				msg.reply('Usage:\n!notifications enable\n!notifications disable');
			} else if (msg.content.toLocaleLowerCase() == '!status') {
				console.log(msg.author.username + ' requested server status');
				try {
					let result: ICheckResult[] = [];
					msg.reply('Checking server...');
					result = await ARKNotificationBot.INSTANCE.checkAll();


					let text = 'Server status:';
					result.forEach(res => {
						text += '\n----- ' + res.server.name + ' -----';
						text += '\nStatus: ' + (res.status.online ? 'Online' : 'Offline');
						if (res.status.online) {
							text += '\nName: ' + res.status.result.name;
							text += '\nPlayers: ' + res.status.result.players.length + '/' + res.status.result.maxplayers;
							text += '\nMap: ' + res.status.result.map;
						}
					});
					msg.reply(text);
				} catch (err) {
					console.log(err);
				}
			}
		});

		setInterval(function () {
			ARKNotificationBot.INSTANCE.checkLoop();
		}, scanInterval);
		ARKNotificationBot.INSTANCE.checkLoop();
	}

	async checkLoop() {
		let result: ICheckResult[] = await this.checkAll();
		let notifications: INotification[] = [];

		if (this._oldResult == undefined) {
			console.log('No old result found');
			this._oldResult = result;
			return;
		}

		for (let i: number = 0; i < result.length; i++) {
			//console.log(this._oldPlayers[result[i].server.name]);
			if (this._oldPlayers[result[i].server.name] == undefined) {
				this._oldPlayers[result[i].server.name] = [];
				if (result[i].status.result != undefined) {
					for (let j: number = 0; j < result[i].status.result.players.length; j++) {
						this._oldPlayers[result[i].server.name].push(result[i].status.result.players[j].name);
					}
				}
			}
		}

		console.log('Processing changes');

		//console.log(result);

		for (let i: number = 0; i < result.length; i++) {
			for (let j: number = 0; j < this._oldResult.length; j++) {
				if (this._oldResult[j].server.name != result[i].server.name) {
					continue;
				}

				// Online check
				if (result[i].status.online != this._oldResult[j].status.online) {
					if (result[i].status.online) {
						notifications.push({
							type: NotificationType.SERVER_UP,
							message: result[i].server.name + ' is now online'
						});
					} else {
						notifications.push({
							type: NotificationType.SERVER_DOWN,
							message: result[i].server.name + ' is now offline'
						});
					}
				}

				if (result[i].status.result == undefined) {
					console.log('status.result was undefined! can\'t run player check');
					break;
				}

				// Player check
				if (result[i].status.result.players.length != this._oldPlayers[result[i].server.name].length) {
					console.log('Player count changed new: ' + result[i].status.result.players.length + ' old: ' + this._oldPlayers[result[i].server.name].length);
					let newPlayerNames: string[] = [];

					for (let k: number = 0; k < result[i].status.result.players.length; k++) {
						newPlayerNames.push(result[i].status.result.players[k].name);
					}

					//console.log(this._oldResult[j].status.result.players);
					//console.log(result[i].status.result.players);

					//console.log(newPlayerNames);

					let difference: string[] = newPlayerNames.filter(x => !this._oldPlayers[result[i].server.name].includes(x)).concat(this._oldPlayers[result[i].server.name].filter(x => !newPlayerNames.includes(x)));

					console.log('Difference is ' + difference.length);

					for (let k: number = 0; k < difference.length; k++) {
						if (difference[k] == undefined) {
							continue;
						}

						if (newPlayerNames.indexOf(difference[k]) > -1) {
							notifications.push({
								type: NotificationType.PLAYER_JOIN,
								message: difference[k] + ' joined ' + result[i].server.name
							});
							this._oldPlayers[result[i].server.name].push(difference[k]);
						} else {
							notifications.push({
								type: NotificationType.PLAYER_LEAVE,
								message: difference[k] + ' left ' + result[i].server.name
							});

							for (let l: number = 0; l < this._oldPlayers[result[i].server.name].length; l++) {
								if (this._oldPlayers[result[i].server.name][l] == difference[k]) {
									this._oldPlayers[result[i].server.name].splice(l, 1);
								}
							}
						}
					}
				}

				break;
			}
		}

		this._oldResult = result;
		console.log(notifications.length + ' new notifications');
		if (notifications.length > 0) {
			console.log(notifications);
		}

		for (let i: number = 0; i < notifications.length; i++) {
			for (let j: number = 0; j < this._notificationUsers.length; j++) {
				try {
					console.log('Sending ' + notifications[i] + ' to ' + this._notificationUsers[j]);
					this._client.fetchUser(this._notificationUsers[j]).then((user) => {
						user.send(notifications[i].message);
					});
				} catch (err) {
					console.log(err);
				}
			}
		}
	}

	loadData() {
		if (FS.existsSync('./data.json')) {
			let content: any = JSON.parse(FS.readFileSync('./data.json', 'utf8'));
			this._notificationUsers = content.users;
		}
	}

	saveData() {
		FS.writeFileSync('./data.json', JSON.stringify({
			users: this._notificationUsers
		}));
	}

	async checkAll(): Promise<ICheckResult[]> {
		let results: ICheckResult[] = [];
		console.log('Checking all sevrers');

		for (let i: number = 0; i < this._servers.length; i++) {
			console.log('Checking server: ' + this._servers[i].name);
			results.push(await this.checkServer(this._servers[i]));
		}

		return results;
	}

	checkServer(server: IServer) {
		return new Promise<ICheckResult>(async function (resolve, reject) {
			let checkResult = await ServerChecker.checkServer(server);
			resolve({
				server: server,
				status: checkResult
			});
		});
	}
}