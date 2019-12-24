import ARKNotificationBot from './ARKNotificationBot';
import { IServer } from './ServerChecker';

const config: any = require('../config.json');
var servers: IServer[] = [];

for(let i: number = 0; i < config.servers.length; i++) {
	servers.push(config.servers[i]);
}

const bot = new ARKNotificationBot(config.discord_token, servers, config.scan_interval, config.rate_limit.enabled, config.rate_limit.max_messages, config.rate_limit.ban_time);