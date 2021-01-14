## File Downloader for Balena

This is a simple Express server project that works on any of the [balena][balena-link] supported devices. It can download a specific json file and all connected files and then provides them as a static local (offline) server. 

This project serves the downloaded all connected files:
http://fileupdate:3000/config_files.json
http://fileupdate:3000/exampleVideo.mp4

### How to use
To get this project up and running, you will need to signup for a balena account [here][signup-page] and set up an application and device. You'll find full details in our [Getting Started tutorial][gettingstarted-link].

Once you have downloaded this project, you can `balena push` it using the [balenaCLI][balena-cli]. This command will package up and push the code to the balena builders, where it will be compiled and built and deployed to every device in the application fleet. When it completes, you'll have a node.js web server running on your device and see some logs on your [balenaCloud dashboard][balena-dashboard].

Set the BASE_URL service Variable (service: fileupdate) to your endpoint (https://example.com/data.json)

[balena-link]: https://balena.io/
[signup-page]: https://dashboard.balena-cloud.com/signup
[gettingstarted-link]: http://balena.io/docs/learn/getting-started/
[balena-cli]: https://www.balena.io/docs/reference/cli/
[balena-dashboard]: https://dashboard.balena-cloud.com/

```
Docker Composer:
build: ./balena-downloader
privileged: true
ports: - "3000:3000"
volumes: - "workdir:/usr/src/app/update_live"
labels:
io.resin.features.dbus: "1"
io.resin.features.kernel-modules: "1"
io.resin.features.firmware: "1"
```
