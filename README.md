![Logo](admin/device-watcher.png)
# ioBroker.device-watcher

[![NPM version](https://img.shields.io/npm/v/iobroker.device-watcher.svg)](https://www.npmjs.com/package/iobroker.device-watcher)
[![Downloads](https://img.shields.io/npm/dm/iobroker.device-watcher.svg)](https://www.npmjs.com/package/iobroker.device-watcher)
![Number of Installations](https://iobroker.live/badges/device-watcher-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/device-watcher-stable.svg)
[![Dependency Status](https://img.shields.io/david/ciddi89/iobroker.device-watcher.svg)](https://david-dm.org/ciddi89/iobroker.device-watcher)

[![NPM](https://nodei.co/npm/iobroker.device-watcher.png?downloads=true)](https://nodei.co/npm/iobroker.device-watcher/)

**Tests:** ![Test and Release](https://github.com/ciddi89/ioBroker.device-watcher/workflows/Test%20and%20Release/badge.svg)

## Device-Watcher adapter for ioBroker

This is a watchdog for wireless devices. It works currently with the Zigbee, Shelly, Sonoff and Ble adapter (mi flora plant sensor). The adapter looks every sixty minutes for the rssi/link quality and battery states and create JSON lists of them (devices with battery, devices with link quality, devices offline and devices all) and count the devices in the same categories. For example you can use the lists and states for Grafana, Jarvis etc.

The adapter has also the option to send notifications if the number of offline devices are changed and to send you a notification if devices has a low battery state (e.g. 30%). You can choose the value for the battery notification and on which days you want the notification for low batteries. Currently supported notification services are Pushover, Telegram and Jarvis Notification.

 If you found a bug or you have an improvement suggestion, feel free to open an issue.

### Blacklist

 If you don't want a specifice device in the list, you can add it in the blacklist and the adapter will ignore it. Please add the "link_quality" or "rssi" object of this device in the blacklist and it won't be listet and count.

![add_blacklist.png](admin/images/add_blacklist.png)

### Here are some images how the lists look:

![list1.png](admin/images/list1.png)
![list2.png](admin/images/list2.png)
![list3.png](admin/images/list3.png)


### Changelog
<!--
    Placeholder for the next version (at the beginning of the line):
    ### **WORK IN PROGRESS**
-->
### 0.0.6 (2022-06-10)

- added Homematic, Deconz, Zwave
- added Email notification
- added count and list for low battery devices
- changes Log state dp to last notification state dp
- Using available state instead of link quality state for zigbee devices
- Show the correct time of last contact instead the minutes if the time is under 100minutes
- small bugfixes

### 0.0.5 (2022-06-05)

-   added admin translations

### 0.0.3 (2022-06-05)

-   added Shelly and Sonoff Devices

### 0.0.2 (2022-06-05)

-   Release for testing

### 0.0.1 (2022-05-01)

-   initial release

## License
MIT License

Copyright (c) 2022 Christian Behrends <mail@christian-behrends.de>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.