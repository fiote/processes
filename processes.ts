import { exec } from "child_process";

module.exports = {};

interface OptionsProcesses {
	port: number;
	endpoint: string;
	verbose?: boolean;

	secret?: string;

	filter: FilterData;
}

interface FilterData {
	include?: string[];
	exclude?: string[];
	minDuration?: number;
	maxDuration?: number;
}

interface PsData {
	pid: number;
	user: string;
	dstime: string;
	command: string;
	duration: number;
	minutes: number;
	dslate: string;
}

const getProcesses = (filter: FilterData) : Promise<PsData[]> => {
	return new Promise(resolve => {
		exec('ps -eo pid,user,etime,cmd --no-headers',(err, stdout, stderr) => {
			const list = stdout.split("\n").map(line => {
				line = line.replace(/\s{2,}/g,' ').trim();
				if (!line) return null;

				let parts = line.split(" ");

				let data = {} as PsData;
				data.pid = parseInt(parts.shift()!);
				data.user = parts.shift()!;
				data.dstime = parts.shift()!;
				data.command = parts.join(" ");

				if (!data.dstime) console.log(line);

				let partsDate = data.dstime.split("-");
				let time = partsDate.pop()!;
				let days = parseInt(partsDate.pop() || '0');

				let partsTime = time.split(":");
				let seconds = parseInt(partsTime.pop()!);
				let minutes = parseInt(partsTime.pop()!);
				let hours = parseInt(partsTime.pop()!) || 0;
				hours += days*24;

				let duration = 0;
				duration += seconds;
				duration += minutes*60;
				duration += hours*60*60;
				data.duration = duration;
				data.minutes = data.duration/60;

				let dsseconds = seconds.toString();
				let dsminutes = minutes.toString();
				if (seconds < 10) dsseconds = '0'+seconds;
				if (minutes < 10) dsminutes = '0'+minutes;

				data.dslate = '';
				if (hours) data.dslate += hours+'h';
				data.dslate += dsminutes+'m';
				data.dslate += dsseconds+'s';
				return data;
			}).filter(data => {
				if (!data) return false;

				if (filter.include && filter.include.length > 0) {
					const good = filter.include.some(term => data.command.includes(term));
					if (!good) return false;
				}

				if (filter.exclude && filter.exclude.length > 0) {
					const bad = filter.exclude.some(term => data.command.includes(term));
					if (bad) return false;
				}

				if (filter.minDuration && data.duration < filter.minDuration) return false;
				if (filter.maxDuration && data.duration > filter.maxDuration) return false;

				return true;
			}) as PsData[];

			resolve(list);
		});
	});
}

module.exports.start = async (options: OptionsProcesses) => {
	const express = require('express');

	const app = express();
	var bodyParser = require('body-parser');
	app.use(bodyParser.json());
	app.use(bodyParser.urlencoded({ extended: true }));


	app.post(options.endpoint, async (req: any, res: any) => {
		if (options.verbose) console.log('[POST] '+options.endpoint);

		function fnSendJson(status: number, result: any) {
			if (options.verbose) {
				console.log(status);
				console.log(result);
			}
			res.status(status);
			res.setHeader('Content-Type', 'application/json');
			res.send(JSON.stringify(result));
		}

		res.header("Access-Control-Allow-Origin", "*");
		res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");

		// if a secret is configured
		if (options.secret) {
			// assuming the key is wrong
			let trueKey = (req.body.secret && req.body.secret === options.secret);
			// if the key is not right
			if (!trueKey) return fnSendJson(401, {status:false, message:'Wrong secret key.'});
		}

		var list = await getProcesses(req.body.filter);
		fnSendJson(200, {status: true, list});
	});


	app.listen(options.port, function () {
		if (options.verbose) console.log(`Processes listening on port ${options.port}!`);
	});
}