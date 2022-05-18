/* jshint -W097 */
/* jshint strict: false */
/* jslint node: true */

'use strict';

const utils = require('@iobroker/adapter-core');
const adapterName = require('./package.json').name.split('.').pop();

class DeviceWatcher extends utils.Adapter {

	constructor(options) {
		super({
			...options,
			name: adapterName,
			useFormatDate: true,
		});

		this.refreshEverythingTimeout = null;

		this.on('ready', this.onReady.bind(this));
		//this.on('stateChange', this.onStateChange.bind(this));
		// this.on('objectChange', this.onObjectChange.bind(this));
		// this.on('message', this.onMessage.bind(this));
		this.on('unload', this.onUnload.bind(this));
	}

	async onReady() {
		this.log.debug('Adapter Device-Watcher was started');

		try {
			await this.main();
			this.log.debug('all done, exiting');
			this.terminate ? this.terminate('Everything done. Going to terminate till next schedule', 11) : process.exit(0);
		} catch (e) {
			this.log.error('Error while running Device-Watcher. Error Message:' + e);
			this.terminate ? this.terminate(15) : process.exit(15);
		}



	}

	async main() {

		const pushover = {
			instance: this.config.instancePushover,
			title: this.config.titlePushover,
			device: this.config.devicePushover

		};
		const telegram = {
			instance: this.config.instanceTelegram,
			user: this.config.deviceTelegram
		};
		const jarvis = {
			instance: this.config.instanceJarvis,
			title: this.config.titleJarvis

		};

		const sendPushover = async (text) => {
			await this.sendToAsync(pushover.instanz, 'send', {
				message: 'Device-Watcher: ' + text,
				title: pushover.title,
				device: pushover.device
			});
		};

		const sendTelegram = async (text) => {
			await this.sendToAsync(telegram.instance, 'send', {
				text: text,
				user: telegram.user
			});
		};

		const sendJarvis = async (text) => {
			await this.setForeignStateAsync('jarvis.0.addNotification', text);
		};

		this.log.debug('Function started: ' + this.main.name);

		const arrOfflineDevices         = []; //JSON-Info alle offline-Geräte
		const jsonLinkQualityDevices    = []; //JSON-Info alle mit LinkQuality
		const arrBatteryPowered         = []; //JSON-Info alle batteriebetriebenen Geräte
		const arrListAllDevices         = []; //JSON-Info Gesamtliste mit Info je Gerät
		let offlineDevicesCount			= 0;
		let deviceCounter;
		let batteryPoweredCount;
		let arrOfflineDevicesZero	= [];
		let arrLinkQualityDevicesZero = [];
		let arrBatteryPoweredZero = [];
		let arrListAllDevicesZero = [];


		if (!this.config.zigbeeDevices && !this.config.bleDevices && !this.config.test) {
			this.log.warn('No devices selected. Pleased check the instance configuration');
			return;
		}

		const myArrDev                  = []; //JSON mit Gesamtliste aller Geräte

		if (this.config.test) {
			myArrDev.push({'Selektor':'0_userdata.*.link_quality','theName':'common', 'adapter':'Test'});
			this.log.warn('Teststates wurden ausgewählt. Lade Daten...');
		}

		if (this.config.bleDevices) {
			myArrDev.push({'Selektor':'ble.*.rssi','theName':'common', 'adapter':'Ble'});
			this.log.info('Ble Devices wurden ausgewählt (Xiaomi Plant Sensor). Lade Daten...');
		}
		if (this.config.zigbeeDevices) {
			myArrDev.push({'Selektor':'zigbee.*.link_quality','theName':'common', 'adapter':'Zigbee'});
			this.log.info('Zigbee Devices wurden ausgewählt. Lade Daten...');
		}

		this.log.debug(JSON.stringify(myArrDev));

		for (let i = 0; i < myArrDev.length; i++) {
			const devices = await this.getForeignStatesAsync(myArrDev[i].Selektor);
			const deviceAdapterName = myArrDev[i].adapter;

			this.log.debug(JSON.stringify(devices));

			const myBlacklist 				= this.config.tableBlacklist;
			const myBlacklistArr			= [];

			for(const i in myBlacklist){
				myBlacklistArr.push(myBlacklist[i].device);
				this.log.debug('Found items on the blacklist: ' + myBlacklistArr);
			}

			for(const [id] of Object.entries(devices)) {
				if (!myBlacklistArr.includes(id)) {

					const currDeviceString    = id.slice(0, (id.lastIndexOf('.') + 1) - 1);

					//Device Namen
					const deviceObject = await this.getForeignObjectAsync(currDeviceString);
					let deviceName;

					if (deviceObject && typeof deviceObject === 'object') {
						deviceName = deviceObject.common.name;
					}
					//Raum Namen
					let currRoom;

					//Link Qualität
					const deviceQualityState = await this.getForeignStateAsync(id);
					let linkQuality;

					if (deviceQualityState){
						if (this.config.trueState) {
							linkQuality = deviceQualityState.val;
						} else if ((deviceQualityState.val != null) && (typeof deviceQualityState.val === 'number')) {
							if (deviceQualityState.val < 0) {
								linkQuality = Math.min(Math.max(2 * (deviceQualityState.val + 100), 0), 100) + '%';
							} else if ((deviceQualityState.val) >= 0) {
								linkQuality = parseFloat((100/255 * deviceQualityState.val).toFixed(0)) + '%';
							}
						}
					}

					jsonLinkQualityDevices.push(
						{
							device: deviceName,
							adapter: deviceAdapterName,
							room: currRoom,
							link_quality: linkQuality
						}
					);

					// 2. Wann bestand letzter Kontakt zum Gerät
					if (deviceQualityState) {
						try {
							const time = new Date();
							const lastContact = Math.round((time.getTime() - deviceQualityState.ts) / 1000 / 60);
							// 2b. wenn seit X Minuten kein Kontakt mehr besteht, nimm Gerät in Liste auf
							//Rechne auf Tage um, wenn mehr als 48 Stunden seit letztem Kontakt vergangen sind
							let lastContactString = Math.round(lastContact) + ' Minuten';
							if (Math.round(lastContact) > 100) {
								lastContactString = Math.round(lastContact/60) + ' Stunden';
							}
							if (Math.round(lastContact/60) > 48) {
								lastContactString = Math.round(lastContact/60/24) + ' Tagen';
							}
							if (lastContact > this.config.maxMinutes) {
								arrOfflineDevices.push(
									{
										device: deviceName,
										adapter: deviceAdapterName,
										room: currRoom,
										lastContact: lastContactString
									}
								);
							}
						} catch (e) {
							this.log.error('(03) Error while getting timestate ' + e);
						}
					}

					// 3. Batteriestatus abfragen
					const currDeviceBatteryString = currDeviceString + '.battery';
					const deviceBatteryState = await this.getForeignStateAsync(currDeviceBatteryString);
					let batteryHealth;

					if (!deviceBatteryState) {
						batteryHealth = ' - ';
					} else if (deviceBatteryState) {
						batteryHealth = (deviceBatteryState).val + '%';
						arrBatteryPowered.push(
							{
								device: deviceName,
								adapter: deviceAdapterName,
								room: currRoom,
								battery: batteryHealth
							}
						);
					}

					// 4. Alle Geräte in die Liste eintragen
					arrListAllDevices.push(
						{
							device: deviceName,
							adapter: deviceAdapterName,
							room: currRoom,
							battery: batteryHealth,
							link_quality: linkQuality
						}
					);

					// 1b. Zähle, wie viele Geräte existieren
					//------------------------
					deviceCounter = jsonLinkQualityDevices.length;

					// 2c. Wie viele Geräte sind offline?
					//------------------------
					offlineDevicesCount = arrOfflineDevices.length;

					// 3c. Wie viele Geräte sind batteriebetrieben?
					//------------------------
					batteryPoweredCount = arrBatteryPowered.length;

					// Wenn keine Devices gezählt sind
					//------------------------
					arrOfflineDevicesZero       = [{Device: '--keine--', Room: '', Last_contact: ''}]; //JSON-Info alle offline-Geräte = 0
					arrLinkQualityDevicesZero   = [{Device: '--keine--', Room: '', Link_quality: ''}]; //JSON-Info alle mit LinkQuality = 0
					arrBatteryPoweredZero       = [{Device: '--keine--', Room: '', Battery: ''}]; //JSON-Info alle batteriebetriebenen Geräte
					arrListAllDevicesZero       = [{Device: '--keine--', Room: '', Battery: '', Last_contact: '', Link_quality: ''}]; //JSON-Info Gesamtliste mit Info je Gerät

					//const time = new Date();
					//this.log.warn('The Day Number Today: ' + time.getUTCDay());
				}
			} //<--Ende zweite Schleife
		} //<---Ende Hauptschleife

		//Notifications
		//Offline Message
		if(this.config.checkSendOfflineMsg) {
			try {
				let msg = '';
				const offlineDevicesCountOld = await this.getStateAsync('offlineCount');

				if ((offlineDevicesCountOld != null) && (offlineDevicesCountOld != undefined) && (offlineDevicesCountOld.val != null)) {
					this.log.warn('Offline Devices Count New: ' + offlineDevicesCount + ' Offline Devices Count Old: ' + offlineDevicesCountOld.val);
					if (offlineDevicesCount > offlineDevicesCountOld.val) {
						if (offlineDevicesCount == 1) {
							msg = 'Folgendes Gerät ist seit einiger Zeit nicht erreichbar: \n';
						} else if (offlineDevicesCount >= 2) {
							msg = 'Folgende ' + offlineDevicesCount + ' Geräte sind seit einiger Zeit nicht erreichbar: \n';
						}
						for (const id of arrOfflineDevices) {
							msg = msg + '\n' + id['device'] + ' ' + /*id['room'] +*/ ' (' + id['lastContact'] + ') ';
						}
						this.log.warn(msg);
						await this.setStateAsync('deviceWatcherLog', msg, true);
						if (pushover.instanz) {
							try {
								sendPushover(msg);
							} catch (e) {
								this.log.warn ('Getting error at sending notification' + (e));
							}
						}
						if (telegram.instance) {
							try {
								sendTelegram(msg);
							} catch (e) {
								this.log.warn ('Getting error at sending notification' + (e));
							}
						}
						if (jarvis.instance) {
							try {
								sendJarvis('{title":"'+ jarvis.title +' (' + this.formatDate(new Date(), 'DD.MM.YYYY - hh:mm:ss') + ')","message":" ' + offlineDevicesCount + ' Geräte sind nicht erreichbar","display": "drawer"}');
							} catch (e) {
								this.log.warn ('Getting error at sending notification' + (e));
							}
						}
					}

				}
			} catch (e) {
				this.log.debug('Getting error at sending offline notification ' + e);
			}

		}
		//Batterie Notification
		if (this.config.checkSendBatteryMsg) {
			try {
				let batteryMinCount = 0;
				const batteryWarningMin = this.config.minWarnBatterie;
				const batteryData = await this.getStateAsync('batteryList');
				if ((batteryData != null) && (batteryData != undefined) && (batteryData.val != null)) {
					const batteryDataJson = JSON.parse(String(batteryData.val));

					let infotext = '';
					for (const id of batteryDataJson) {
						if (id['battery']) {
							const batteryValue = id['battery'].replace('%', '');
							if (batteryValue < batteryWarningMin) {
								infotext = infotext + '\n' + id['device'] + ' ' + /*id['room'] +*/ ' (' + id['battery'] + ')';
								++batteryMinCount;
							}
						}
					}

					if (batteryMinCount > 0) {
						this.log.info('Batteriezustand: ' + infotext);
						await this.setStateAsync('deviceWatcherLog', infotext, true);
						/*if (jarvis.instance) {
							try {
								await sendJarvis('{"title":"'+ jarvis.title +' (' + this.formatDate(new Date(), 'DD.MM.YYYY - hh:mm:ss') + ')","message":" ' + batteryMinCount + ' Geräte mit schwacher Batterie","display": "drawer"}');
							} catch (e) {
								this.log.warn ('Getting error at sending notification' + (e));
							}
						}*/
						if (pushover.instance) {
							try {
								await sendPushover('Batteriezustand: ' + infotext);
							} catch (e) {
								this.log.warn ('Getting error at sending notification' + (e));
							}
						}
						if (telegram.instance) {
							try {
								await sendTelegram('Batteriezustand: ' + infotext);
							} catch (e) {
								this.log.warn ('Getting error at sending notification' + (e));
							}
						}

					}
					else {
						await this.setStateAsync('deviceWatcherLog', 'Batterien der Geräte in Ordnung', true);
					}
				}
			} catch (e) {
				this.log.debug('Getting error at batterynotification ' + e);
			}

		}

		// Datenpunkte beschreiben
		this.log.debug('write the datapoints ' + this.main.name);

		try {
			await this.setStateAsync('offlineCount', {val: offlineDevicesCount, ack: true});
			await this.setStateAsync('countAll', {val: deviceCounter, ack: true});
			await this.setStateAsync('batteryCount', {val: batteryPoweredCount, ack: true});

			if (deviceCounter == 0) {
				await this.setStateAsync('linkQualityList', {val: JSON.stringify(arrLinkQualityDevicesZero), ack: true});
				await this.setStateAsync('ListAll', {val: JSON.stringify(arrListAllDevicesZero), ack: true});
			} else {
				await this.setStateAsync('linkQualityList', {val: JSON.stringify(jsonLinkQualityDevices), ack: true});
				await this.setStateAsync('listAll', {val: JSON.stringify(arrListAllDevices), ack: true});
			}

			if (offlineDevicesCount == 0) {
				await this.setStateAsync('offlineList', {val: JSON.stringify(arrOfflineDevicesZero), ack: true});
			} else {
				await this.setStateAsync('offlineList', {val: JSON.stringify(arrOfflineDevices), ack: true});
			}

			if (batteryPoweredCount == 0) {
				await this.setStateAsync('batteryList', {val: JSON.stringify(arrBatteryPoweredZero), ack: true});
			} else {
				await this.setStateAsync('batteryList', {val: JSON.stringify(arrBatteryPowered), ack: true});
			}

			//Zeitstempel wann die Datenpunkte zuletzt gecheckt wurden
			const lastCheck = this.formatDate(new Date(), 'DD.MM.YYYY') + ' - ' + this.formatDate(new Date(), 'hh.mm.ss');
			await this.setStateAsync('lastCheck', lastCheck, true);

			this.log.debug('write the datapoints finished ' + this.main.name);
		}
		catch (e) {
			this.log.error('(05) Error while writing the states ' + e);
		}

		this.log.debug('Function finished: ' + this.main.name);
	}

	onUnload(callback) {
		try {
			this.log.info('cleaned everything up...');
			callback();
		} catch (e) {
			callback();
		}
	}
}

if (require.main !== module) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new DeviceWatcher(options);
} else {
	// otherwise start the instance directly
	new DeviceWatcher();
}