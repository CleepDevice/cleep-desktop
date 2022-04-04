![256x256.png](https://github.com/tangb/CleepDesktop/blob/master/resources/256x256.png)

![Known Vulnerabilities](https://snyk.io/test/github/tangb/cleep-desktop/badge.svg)

# Welcome to CleepDesktop

CleepDesktop is a cross-platform desktop application that helps user to easily detect, configure and monitor its Cleep devices.

## Quick start
Download latest CleepDesktop release from https://github.com/tangb/CleepDesktop/releases for your desktop environment and install it.
During first application launch, CleepDesktop will download necessary tools automatically.

> For linux users it is advised of installing [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher) to properly handle your AppImages.

## How it works
CleepDesktop discovers Cleep devices on user network and add quick access buttons to configure it.

Application main window is separated in 2 parts:

* The left panel displays list of discovered devices (configured and unconfigured ones)
* The right panel displays selected Cleep device configuration panels and CleepDesktop configurations panels.

## Features
### SD card burning
CleepDesktop embeds flashing SD card tool (Balena-etcher) and searches automatically available latest Cleep release. So user can install Cleep distribution in 3 clicks.
There is also a simple way to pre-configure wifi access in case of device uses wireless connection.

### Auto update
CleepDesktop checks for available updates at startup and install it automatically.

### Device monitoring
Devices messages like temperature updates, motion detection, voice recognition detected hotword, etc... can be viewed on dedicated page.

### Community
Direct access to community tools (slack, isntagram) and latest messages from community.

## License
This application is free and open source (MIT license) and it's based on Electron and Python3.
