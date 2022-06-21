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

	//Hilfsfuntkionen
	async capitalize(sentence)
	{
		return sentence && sentence[0].toUpperCase() + sentence.slice(1);
	}

	async main() {

		const pushover = {
			instance: this.config.instancePushover,
			title: this.config.titlePushover,
			device: this.config.devicePushover

		};
		const telegram = {
			instance: this.config.instanceTelegram,
			user: this.config.deviceTelegram,
			chatId: this.config.chatIdTelegram
		};
		const email = {
			instance: this.config.instanceEmail,
			subject: this.config.subjectEmail,
			sendTo: this.config.sendToEmail

		};
		const jarvis = {
			instance: this.config.instanceJarvis,
			title: this.config.titleJarvis

		};
		const lovelace = {
			instance: this.config.instanceLovelace,
			title: this.config.titleLovelace

		};

		const choosedDays = {
			monday: this.config.checkMonday,
			tuesday: this.config.checkTuesday,
			wednesday: this.config.checkWednesday,
			thursday: this.config.checkThursday,
			friday: this.config.checkFriday,
			saturday: this.config.checkSaturday,
			sunday: this.config.checkSunday,
		};

		const sendPushover = async (text) => {
			await this.sendToAsync(pushover.instance, 'send', {
				message: text,
				title: pushover.title,
				device: pushover.device
			});
		};

		const sendTelegram = async (text) => {
			await this.sendToAsync(telegram.instance, 'send', {
				text: text,
				user: telegram.user,
				chatId: telegram.chatId
			});
		};

		const sendEmail = async (text) => {
			await this.sendToAsync(email.instance, 'send', {
				sendTo: email.sendTo,
				text: text,
				subject: email.subject
			});
		};

		const sendJarvis = async (text) => {
			await this.setForeignStateAsync(jarvis.instance + '.addNotification', text);
		};

		const sendLovelace = async (text) => {
			await this.setForeignStateAsync(lovelace.instance + '.notifications.add', text);
		};

		this.log.debug('Function started: ' + this.main.name);

		let arrOfflineDevices        	= []; //JSON-Info of all offline-devices
		let jsonLinkQualityDevices    	= []; //JSON-Info of all devices with linkquality
		let arrBatteryPowered         	= []; //JSON-Info of all devices with battery
		let arrBatteryLowPowered		= [];
		let arrListAllDevices         	= []; //JSON-Info total list with info of all devices
		let offlineDevicesCount			= 0;
		let deviceCounter				= 0;
		let linkQualityCount			= 0;
		let batteryPoweredCount 		= 0;
		let lowBatteryPoweredCount		= 0;
		let lastContactString;

		const supAdapter = {
			zigbee: 		this.config.zigbeeDevices,
			ble: 			this.config.bleDevices,
			sonoff: 		this.config.sonoffDevices,
			shelly: 		this.config.shellyDevices,
			homematic: 		this.config.homematicDevices,
			deconz:			this.config.deconzDevices,
			zwave: 			this.config.zwaveDevices,
			dect: 			this.config.dectDevices,
			hue: 			this.config.hueDevices,
			hueExt: 		this.config.hueExtDevices,
			nukiExt: 		this.config.nukiExtDevices,
			ping: 			this.config.pingDevices,
			switchbotBle: 	this.config.switchbotBleDevices,
			sonos: 			this.config.sonosDevices,
			test: 			false, // Only for Developer
			test2: 			false // Only for Developer
		};

		if (!supAdapter.zigbee &&
			!supAdapter.ble &&
			!supAdapter.sonoff &&
			!supAdapter.shelly &&
			!supAdapter.homematic &&
			!supAdapter.deconz &&
			!supAdapter.zwave &&
			!supAdapter.dect &&
			!supAdapter.hue &&
			!supAdapter.hueExt &&
			!supAdapter.nukiExt &&
			!supAdapter.ping &&
			!supAdapter.switchbotBle &&
			!supAdapter.sonos
		) {
			this.log.warn('No devices selected. Pleased check the instance configuration');
		}

		const myArrDev = []; //JSON mit Gesamtliste aller Geräte

		const arrApart = {
			test: 		{'Selektor':'0_userdata.*.UNREACH', 'adapter':'Homematic', 'battery':'.OPERATING_VOLTAGE', 'reach':'.UNREACH'},
			test2: 		{'Selektor':'0_userdata.*.reachable', 'adapter':'Hue Extended', 'battery':'.config.battery', 'reach':'none', 'isLowBat':'none'},

			ble: 			{'Selektor':'ble.*.rssi', 'adapter':'Ble', 'battery':'.battery', 'reach':'none', 'isLowBat':'none'},
			zigbee: 		{'Selektor':'zigbee.*.link_quality', 'adapter':'Zigbee', 'battery':'.battery', 'reach':'none', 'isLowBat':'none'},
			sonoff: 		{'Selektor':'sonoff.*.Wifi_RSSI', 'adapter':'Sonoff', 'battery':'.battery', 'reach':'none', 'isLowBat':'none'},
			shelly: 		{'Selektor':'shelly.*.rssi', 'adapter':'Shelly', 'battery':'.sensor.battery', 'reach':'none', 'isLowBat':'none'},
			homematic: 		{'Selektor':'hm-rpc.*.RSSI_DEVICE', 'adapter':'Homematic', 'battery':'.OPERATING_VOLTAGE', 'reach':'.UNREACH', 'isLowBat':'LOW_BAT'},
			deconz: 		{'Selektor':'deconz.*.reachable', 'adapter':'Deconz', 'battery':'.battery', 'reach':'.reachable', 'isLowBat':'none'},
			zwave: 			{'Selektor':'zwave2.*.ready', 'adapter':'Zwave', 'battery':'.Battery.level', 'reach':'.ready', 'isLowBat':'.Battery.isLow'},
			dect: 			{'Selektor':'fritzdect.*.present', 'adapter':'FritzDect', 'battery':'.battery', 'reach':'.present', 'isLowBat':'.batterylow'},
			hue: 			{'Selektor':'hue.*.reachable', 'adapter':'Hue', 'battery':'.battery', 'reach':'.reachable', 'isLowBat':'none'},
			hueExt: 		{'Selektor':'hue-extended.*.reachable', 'adapter':'Hue Extended', 'battery':'.config.battery', 'reach':'.reachable', 'isLowBat':'none'},
			ping: 			{'Selektor':'ping.*.alive', 'adapter':'Ping', 'battery':'none', 'reach':'.alive', 'isLowBat':'none'},
			switchbotBle: 	{'Selektor':'switchbot-ble.*.rssi', 'adapter':'Switchbot Ble', 'battery':'.battery', 'reach':'none', 'isLowBat':'none', 'id':'.id'},
			sonos: 			{'Selektor':'sonos.*.alive', 'adapter':'Sonos', 'battery':'none', 'reach':'.alive', 'isLowBat':'none'}
		};

		for(const [id] of Object.entries(arrApart)) {
			const idAdapter = supAdapter[id];
			if (idAdapter) {
				this.log.info(await this.capitalize(id + ' was selected. Loading data...'));
				myArrDev.push(arrApart[id]);
			}
		}

		this.log.debug(JSON.stringify(myArrDev));

		/*=============================================
		=            Start of main loop    		   	  =
		=============================================*/
		for (let i = 0; i < myArrDev.length; i++) {
			const devices = await this.getForeignStatesAsync(myArrDev[i].Selektor);
			const deviceAdapterName = myArrDev[i].adapter;

			this.log.debug(JSON.stringify(devices));

			const myBlacklist 				= this.config.tableBlacklist;
			const myBlacklistArr			= [];

			/*----------  Loop for blacklist ----------*/
			for(const i in myBlacklist){
				myBlacklistArr.push(myBlacklist[i].device);
				this.log.debug('Found items on the blacklist: ' + myBlacklistArr);
			}

			/*----------  Start of second main loop  ----------*/
			for(const [id] of Object.entries(devices)) {
				if (!myBlacklistArr.includes(id)) {

					const currDeviceString    	= id.slice(0, (id.lastIndexOf('.') + 1) - 1);
					const shortCurrDeviceString = currDeviceString.slice(0, (currDeviceString.lastIndexOf('.') + 1) - 1);

					//Get device name
					const deviceObject = await this.getForeignObjectAsync(currDeviceString);
					const shortDeviceObject = await this.getForeignObjectAsync(shortCurrDeviceString);
					let deviceName;

					if (deviceObject && typeof deviceObject === 'object') {
						deviceName = deviceObject.common.name;
					}

					if  (shortDeviceObject && typeof shortDeviceObject === 'object') {
						if (myArrDev[i].adapter === 'Hue Extended') {
							deviceName = shortDeviceObject.common.name;
						}
					}

					//Get ID for Switchbot Devices
					if (myArrDev[i].adapter === 'Switchbot Ble') {
						const switchbotID = await this.getForeignStateAsync(currDeviceString + myArrDev[i].id);
						if (switchbotID) {
							deviceName = switchbotID.val;
						}
					}

					// 1. Get link quality
					const deviceQualityState = await this.getForeignStateAsync(id);
					let linkQuality;

					if ((deviceQualityState) && (typeof deviceQualityState.val === 'number')){
						if (this.config.trueState) {
							linkQuality = deviceQualityState.val;
						} else {
							if (deviceQualityState.val < 0) {
								linkQuality = Math.min(Math.max(2 * (deviceQualityState.val + 100), 0), 100) + '%';
							} else if ((deviceQualityState.val) >= 0) {
								linkQuality = parseFloat((100/255 * deviceQualityState.val).toFixed(0)) + '%';
							}
						}
					} else {
					// no linkQuality available for powered devices
						linkQuality = ' - ';
				        }
					//  push always
					jsonLinkQualityDevices.push(
     					 {
					    Device: deviceName,
					    Adapter: deviceAdapterName,
					    Link_quality: linkQuality
					 }
					);

					// 1b. Count how many devices with link Quality
					linkQualityCount = jsonLinkQualityDevices.length;

					// 2. When was the last contact to the device?
					if (deviceQualityState) {
						try {
							const time = new Date();
							const lastContact = Math.round((time.getTime() - deviceQualityState.ts) / 1000 / 60);
							const currDeviceUnreachString = currDeviceString + myArrDev[i].reach;
							const deviceUnreachState = await this.getForeignStateAsync(currDeviceUnreachString);

							// 2b. wenn seit X Minuten kein Kontakt mehr besteht, nimm Gerät in Liste auf
							//Rechne auf Tage um, wenn mehr als 48 Stunden seit letztem Kontakt vergangen sind
							//lastContactString = Math.round(lastContact) + ' Minuten';
							lastContactString = this.formatDate(new Date((deviceQualityState.ts)), 'hh:mm') + ' Uhr';
							if (Math.round(lastContact) > 100) {
								lastContactString = Math.round(lastContact/60) + ' Stunden';
							}
							if (Math.round(lastContact/60) > 48) {
								lastContactString = Math.round(lastContact/60/24) + ' Tagen';
							}
							if (myArrDev[i].reach === 'none') {
								if (lastContact > this.config.maxMinutes) {
									arrOfflineDevices.push(
										{
											Device: deviceName,
											Adapter: deviceAdapterName,
											Last_contact: lastContactString
										}
									);
								}
							} else {
								if (deviceUnreachState) {
									if ((deviceUnreachState.val === true) && (myArrDev[i].adapter === 'Homematic')) {
										arrOfflineDevices.push(
											{
												Device: deviceName,
												Adapter: deviceAdapterName,
												Last_contact: lastContactString
											}
										);
									} else if ((deviceUnreachState.val === false) && (myArrDev[i].adapter != 'Homematic')) {
										arrOfflineDevices.push(
											{
												Device: deviceName,
												Adapter: deviceAdapterName,
												Last_contact: lastContactString
											}
										);
									}
								}
							}
						} catch (e) {
							this.log.error('(03) Error while getting timestate ' + e);
						}
					}

					// 2c. Count how many devcies are offline
					offlineDevicesCount = arrOfflineDevices.length;

					// 3. Get battery states
					const currDeviceBatteryString 	= currDeviceString + myArrDev[i].battery;
					const deviceBatteryState		= await this.getForeignStateAsync(currDeviceBatteryString);
					const shortCurrDeviceBatteryString 	= shortCurrDeviceString + myArrDev[i].battery;
					const shortDeviceBatteryState		= await this.getForeignStateAsync(shortCurrDeviceBatteryString);
					let batteryHealth;

					if ((!deviceBatteryState) && (!shortDeviceBatteryState)) {
						batteryHealth = ' - ';
					} else {
						this.log.debug('Adapter ' + (myArrDev[i].adapter));

						switch (myArrDev[i].adapter) {
						case 'Homematic':
						    if ((deviceBatteryState).val === 0) {
							batteryHealth = ' - ';
						    } else {
							batteryHealth = (deviceBatteryState).val + 'V';
						    }

						    arrBatteryPowered.push(
							{
							    Device: deviceName,
							    Adapter: deviceAdapterName,
							    Battery: batteryHealth
							}
						    );
						    break;
						case 'Hue Extended':
						    if (shortDeviceBatteryState) {
							batteryHealth = (shortDeviceBatteryState).val + '%';
							arrBatteryPowered.push(
							    {
								Device: deviceName,
								Adapter: deviceAdapterName,
								Battery: batteryHealth
							    }
							);
						    }
						    break;

						default:
						    batteryHealth = (deviceBatteryState).val + '%';
						    arrBatteryPowered.push(
							{
							    Device: deviceName,
							    Adapter: deviceAdapterName,
							    Battery: batteryHealth
							}
						    );
						}
					}

					// 3b. Count how many devices are with battery
					batteryPoweredCount = arrBatteryPowered.length;

					// 3c. Count how many devices are with low battery
					const batteryWarningMin 		= this.config.minWarnBatterie;
					const currDeviceLowBatString	= currDeviceString + myArrDev[i].isLowBat;
					const deviceLowBatState			= await this.getForeignStateAsync(currDeviceLowBatString);

					if (myArrDev[i].isLowBat === 'none') {
						if (deviceBatteryState && deviceBatteryState.val) {
							if (deviceBatteryState.val < batteryWarningMin) {
								arrBatteryLowPowered.push(
									{
										Device: deviceName,
										Adapter: deviceAdapterName,
										Battery: batteryHealth
									}
								);
							}
						}
					} else {
						if (deviceLowBatState && deviceLowBatState.val) {
							if (deviceLowBatState.val === true) {
								arrBatteryLowPowered.push(
									{
										Device: deviceName,
										Adapter: deviceAdapterName,
										Battery: batteryHealth
									}
								);
							}
						}
					}

					// 3d. Count how many devices are with low battery
					lowBatteryPoweredCount = arrBatteryLowPowered.length;

					// 4. Add all devices in the list
					arrListAllDevices.push(
						{
							Device: deviceName,
							Adapter: deviceAdapterName,
							Battery: batteryHealth,
							Last_contact: lastContactString,
							Link_quality: linkQuality
						}
					);

					// 4a. Count how many devices are exists
					deviceCounter = arrListAllDevices.length;
				}
			} //<--End of second loop
		} //<---End of main loop


		/*=============================================
		=         	  	 Notifications 		          =
		=============================================*/

		/*----------  oflline notification ----------*/
		if(this.config.checkSendOfflineMsg) {
			try {
				let msg = '';
				const offlineDevicesCountOld = await this.getStateAsync('offlineCount');

				if ((offlineDevicesCountOld != undefined) && (offlineDevicesCountOld != null)) {
					if ((offlineDevicesCount != offlineDevicesCountOld.val) && (offlineDevicesCount != 0)) {
						if (offlineDevicesCount == 1) {
							msg = 'Folgendes Gerät ist seit einiger Zeit nicht erreichbar: \n';
						} else if (offlineDevicesCount >= 2) {
							msg = 'Folgende ' + offlineDevicesCount + ' Geräte sind seit einiger Zeit nicht erreichbar: \n';
						}
						for (const id of arrOfflineDevices) {
							msg = msg + '\n' + id['Device'] + ' ' + /*id['room'] +*/ ' (' + id['Last_contact'] + ')';
						}
						this.log.info(msg);
						await this.setStateAsync('lastNotification', msg, true);
						if (pushover.instance) {
							try {
								await sendPushover(msg);
							} catch (e) {
								this.log.warn ('Getting error at sending notification' + (e));
							}
						}
						if (telegram.instance) {
							try {
								await sendTelegram(msg);
							} catch (e) {
								this.log.warn ('Getting error at sending notification' + (e));
							}
						}
						if (email.instance) {
							try {
								await sendEmail(msg);
							} catch (e) {
								this.log.warn ('Getting error at sending notification' + (e));
							}
						}
						if (jarvis.instance) {
							try {
								await sendJarvis('{"title":"'+ jarvis.title +' (' + this.formatDate(new Date(), 'DD.MM.YYYY - hh:mm:ss') + ')","message":" ' + offlineDevicesCount + ' Geräte sind nicht erreichbar","display": "drawer"}');
							} catch (e) {
								this.log.warn ('Getting error at sending notification' + (e));
							}
						}
						if (lovelace.instance) {
							try {
								await sendLovelace('{"message":" ' + offlineDevicesCount + ' Geräte sind nicht erreichbar", "title":"'+ lovelace.title +' (' + this.formatDate(new Date(), 'DD.MM.YYYY - hh:mm:ss') + ')"}');
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

		/*----------  Low battery Notification ----------*/
		const now = new Date();
		const today = now.getDay();
		const checkDays = [];
		let checkToday;

		if (choosedDays.monday) checkDays.push(1);
		if (choosedDays.tuesday) checkDays.push(2);
		if (choosedDays.wednesday) checkDays.push(3);
		if (choosedDays.thursday) checkDays.push(4);
		if (choosedDays.friday) checkDays.push(5);
		if (choosedDays.saturday) checkDays.push(6);
		if (choosedDays.sunday) checkDays.push(0);

		if (this.config.checkSendBatteryMsg) this.log.debug(JSON.stringify(checkDays));

		checkDays.forEach(object => {
			if((object >= 0) && today == object){
				checkToday = true;
			}
		});

		if (this.config.checkSendBatteryMsg) {
			try {
			//Nur einmal abfragen
				const lastBatteryNotifyIndicator = await this.getStateAsync('info.lastBatteryNotification');

				if ((lastBatteryNotifyIndicator != undefined) && (lastBatteryNotifyIndicator != null)) {
					if (now.getHours() < 11) {await this.setStateAsync('info.lastBatteryNotification', false, true);}
					if ((now.getHours() > 11) && (lastBatteryNotifyIndicator.val == false) && (checkToday != undefined)){
						let batteryMinCount = 0;
						const batteryWarningMin = this.config.minWarnBatterie;

						let infotext = '';
						for (const id of arrBatteryPowered) {
							if (id['Battery']) {
								const batteryValue = parseFloat(id['Battery'].replace('%', ''));
								if ((batteryValue < batteryWarningMin) && (id['Adapter'] != 'Homematic')) {
									infotext = infotext + '\n' + id['Device'] + ' ' + /*id['room'] +*/ ' (' + id['Battery'] + ')'.split(', ');
									++batteryMinCount;
								}
							}
						}
						if (batteryMinCount > 0) {
							this.log.info('Batteriezustände: ' + infotext);
							await this.setStateAsync('lastNotification', infotext, true);

							if (pushover.instance) {
								try {
									await sendPushover('Batteriezustände: ' + infotext);
								} catch (e) {
									this.log.warn ('Getting error at sending notification' + (e));
								}
							}
							if (telegram.instance) {
								try {
									await sendTelegram('Batteriezuständ: ' + infotext);
								} catch (e) {
									this.log.warn ('Getting error at sending notification' + (e));
								}
							}
							if (email.instance) {
								try {
									await sendEmail('Batteriezuständ: ' + infotext);
								} catch (e) {
									this.log.warn ('Getting error at sending notification' + (e));
								}
							}
							if (jarvis.instance) {
								try {
									await sendJarvis('{"title":"'+ jarvis.title +' (' + this.formatDate(new Date(), 'DD.MM.YYYY - hh:mm:ss') + ')","message":" ' + batteryMinCount + ' Geräte mit schwacher Batterie","display": "drawer"}');
								} catch (e) {
									this.log.warn ('Getting error at sending notification' + (e));
								}
							}
							if (lovelace.instance) {
								try {
									await sendLovelace('{"message":" ' + batteryMinCount + ' Geräte mit schwacher Batterie", "title":"'+ lovelace.title +' (' + this.formatDate(new Date(), 'DD.MM.YYYY - hh:mm:ss') + ')"}');
								} catch (e) {
									this.log.warn ('Getting error at sending notification' + (e));
								}
							}

							await this.setStateAsync('info.lastBatteryNotification', true, true);
						}
					}
				}
			} catch (e) {
				this.log.debug('Getting error at batterynotification ' + e);
			}
		}


		/*=====  End of Section notifications ======*/


		/*=============================================
		=            	Write Datapoints 		      =
		=============================================*/
		this.log.debug('write the datapoints ' + this.main.name);

		try {
			await this.setStateAsync('offlineCount', {val: offlineDevicesCount, ack: true});
			await this.setStateAsync('countAll', {val: deviceCounter, ack: true});
			await this.setStateAsync('batteryCount', {val: batteryPoweredCount, ack: true});
			await this.setStateAsync('lowBatteryCount', {val: lowBatteryPoweredCount, ack: true});

			if (deviceCounter == 0) {
				arrListAllDevices       = [{Device: '--keine--', Adapter: '', Battery: '', Last_contact: '', Link_quality: ''}]; //JSON-Info Gesamtliste mit Info je Gerät

				await this.setStateAsync('listAll', {val: JSON.stringify(arrListAllDevices), ack: true});
			} else {
				await this.setStateAsync('listAll', {val: JSON.stringify(arrListAllDevices), ack: true});
			}

			if (linkQualityCount == 0) {
				jsonLinkQualityDevices	= [{Device: '--keine--', Adapter: '', Link_quality: ''}]; //JSON-Info alle mit LinkQuality

				await this.setStateAsync('linkQualityList', {val: JSON.stringify(jsonLinkQualityDevices), ack: true});
			} else {
				await this.setStateAsync('linkQualityList', {val: JSON.stringify(jsonLinkQualityDevices), ack: true});
			}


			if (offlineDevicesCount == 0) {
				arrOfflineDevices	= [{Device: '--keine--', Adapter: '', Last_contact: ''}]; //JSON-Info alle offline-Geräte = 0

				await this.setStateAsync('offlineList', {val: JSON.stringify(arrOfflineDevices), ack: true});
			} else {
				await this.setStateAsync('offlineList', {val: JSON.stringify(arrOfflineDevices), ack: true});
			}

			if (batteryPoweredCount == 0) {
				arrBatteryPowered	= [{Device: '--keine--', Adapter: '', Battery: ''}]; //JSON-Info alle batteriebetriebenen Geräte

				await this.setStateAsync('batteryList', {val: JSON.stringify(arrBatteryPowered), ack: true});
			} else {
				await this.setStateAsync('batteryList', {val: JSON.stringify(arrBatteryPowered), ack: true});
			}

			if (lowBatteryPoweredCount == 0) {
				arrBatteryLowPowered	= [{Device: '--keine--', Adapter: '', Battery: ''}]; //JSON-Info alle batteriebetriebenen Geräte

				await this.setStateAsync('lowBatteryList', {val: JSON.stringify(arrBatteryLowPowered), ack: true});
			} else {
				await this.setStateAsync('lowBatteryList', {val: JSON.stringify(arrBatteryLowPowered), ack: true});
			}

			//Zeitstempel wann die Datenpunkte zuletzt gecheckt wurden
			const lastCheck = this.formatDate(new Date(), 'DD.MM.YYYY') + ' - ' + this.formatDate(new Date(), 'hh:mm:ss');
			await this.setStateAsync('lastCheck', lastCheck, true);

			this.log.debug('write the datapoints finished ' + this.main.name);
		}
		catch (e) {
			this.log.error('(05) Error while writing the states ' + e);
		}
		/*=====  End of writing Datapoints ======*/

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
