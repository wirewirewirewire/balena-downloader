## File Downloader for Balena

This is a simple Express server project that works on any of the [balena][balena-link] supported devices. It can download a specific json file and all connected files and then provides them as a static local (offline) server. It will automatically update the content if changes are available. This can be useful for offline first interactive mediaplayer like [balena-player](https://github.com/wirewirewirewire/balena-player).

### How to use

To get this project up and running, you will need to signup for a balena account [here][signup-page] and set up an application and device. You'll find full details in our [Getting Started tutorial][gettingstarted-link].

Once you have downloaded this project, you can `balena push` it using the [balenaCLI][balena-cli]. This command will package up and push the code to the balena builders, where it will be compiled and built and deployed to every device in the application fleet. When it completes, you'll have a node.js web server running on your device and see some logs on your [balenaCloud dashboard][balena-dashboard].

# THIS NEEDS AN UPDATE

Set the `BASE_URL` service variable (service: fileupdate) to your endpoint (https://example.com/data.json)

Now the project serves the downloaded json and all connected files:

```
http://fileupdate:3000/config_files.json // The entrypoint json
http://fileupdate:3000/exampleVideo.mp4 // a file defined in the entrypoint json
```

#### Entrypoint json example

```json
{
  "id": 2,
  "Description": "This file will be also downloaded http://www.example.com/mediaFile.mp4",
  "file": "http://www.example.com/thisImageIsAlsoDownloaded.jpg"
}
```

![Set variables](https://user-images.githubusercontent.com/3281586/104630113-acdc4080-569a-11eb-9c3e-a83d39c0f88d.png)

### Used by

- [balena-player](https://github.com/wirewirewirewire/balena-player) A media player with button support for Raspberry Pi based on OMX player
- [balena-react-mediaplayer](https://github.com/wirewirewirewire/balena-react-mediaplayer) A media player with touch support for Raspberry Pi based on Electron and react.js

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

### Environment variables

The following environment variables allow configuration of the `balena-downloader` :

| Environment variable | Options                | Default                      | Description                                                                                                     |
| -------------------- | ---------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `SYNCTIMEOUT`        | Number(mseconds)       | 5000                         | Intervall to check for file Updates                                                                             |
| `SERVERPORT`         | port number            | 3000                         | port of the included file server                                                                                |
| `TOKEN`              | String(token)          | N/A                          | Token to download the initial config file. It will be added as param to BASE_URL                                |
| `SLUG`               | String(slug)           | N/A                          | Slug to download the content. It will be added as param to BASE_URL                                             |
| `BASEPATH`           | String(path to folder) | `__dirname` or run directory | The root directory to create the download and temp folders                                                      |
| `UPDATE_FOLDER`      | String(foldername)     | update_tmp                   | Name of the folder to store temp files while download                                                           |
| `LIVE_FOLDER`        | String(foldername)     | update_live                  | Name of the folder to store the production data. This folder should be mounted and shared to other applications |
| `BASE_URL`           | URL                    | N/A                          | The URL to get the download config file.                                                                        |
| `ISDEBUG`            | bool                   | false                        | Enable debug logging. Should be disabled in production                                                          |

### Full Player

Example of a full web player using [next.js](https://nextjs.org/), balena-browser[https://github.com/wirewirewirewire/browser|, [balena-xserver](https://github.com/wirewirewirewire/xserver) and [balena-control](https://github.com/wirewirewirewire/balena-control).

Create a folder with your next.js application and make sure it is running.

#### docker-compose.yml

The `docker-compose.yml` is the main entry point and will organize all containers.

Important: Replace `aarch64` with your actual architecture! Can be `amd64` or `aarch64`

`<YOUR_PROJECT>/docker-compose.yml`

```yaml
version: "2"
volumes:
  workdir:
  settings:
  xserver:
services:
  balena-control:
    image: bh.cr/gh_smarthomeagentur/control-aarch64
    restart: always
    privileged: true
    devices:
      - /dev/dri
    group_add:
      - video
    ports:
      - "3009"
      - "3005"
      - "80"
    volumes:
      - "xserver:/tmp/.X11-unix"
    labels:
      io.resin.features.dbus: "1"
      io.resin.features.kernel-modules: "1"
      io.resin.features.firmware: "1"
      io.balena.features.supervisor-api: "1"
  browser:
    image: bh.cr/gh_smarthomeagentur/browser-rpi
    # network_mode: host
    ports:
      - "5011" # management API (optional)
      - "35173" # Chromium debugging port (optional)
    devices:
      - /dev/dri
    group_add:
      - video
    volumes:
      - "settings:/data" # Only required if using PERSISTENT flag (see below)
      - "xserver:/tmp/.X11-unix" # external xserver needed
    labels:
      io.resin.features.dbus: "1"
      io.resin.features.kernel-modules: "1"
      io.resin.features.firmware: "1"
      io.balena.features.supervisor-api: "1"
  downloader:
    image: bh.cr/gh_smarthomeagentur/downloader-aarch64
    privileged: true
    ports:
      - 3000:3000
    volumes:
      - "workdir:/usr/src/app/update_live" # shared workdir for other services
    labels:
      io.resin.features.dbus: "1"
      io.resin.features.kernel-modules: "1"
      io.resin.features.firmware: "1"
      io.balena.features.supervisor-api: "1"
  xserver:
    image: bh.cr/gh_smarthomeagentur/xserver-aarch64
    restart: always
    privileged: true
    volumes:
      - "xserver:/tmp/.X11-unix"
  next-pwa:
    build: .
```

#### Dockerfile.template

Create a `Dockerfile.template` as the installation script to copy your next.js application, install all dependencies and `run build`.

`<YOUR_PROJECT>/Dockerfile.template`

```bash
ARG NODEJS_VERSION="16.19.1"
FROM balenalib/%%BALENA_MACHINE_NAME%%-debian-node:${NODEJS_VERSION}-bullseye-run
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
#    rsync \
#    ddcutil \
#    x11-xserver-utils \
    dbus && \
    apt-get clean && rm -rf /var/lib/apt/lists/*
# Defines our working directory in container
WORKDIR /usr/src/app
COPY package.json package.json
COPY .npmrc .npmrc
RUN JOBS=MAX npm install --production --unsafe-perm && npm cache verify && rm -rf /tmp/*
ENV UDEV=1
COPY . ./
RUN rm -rf middleware.js
RUN rm -rf .env.local
# CMD sysctl -w fs.inotify.max_user_instances=1024
RUN npm run build
RUN sed -i -e 's/\r$//' /usr/src/app/init
# server.js will run when container starts up on the device
CMD ["bash", "/usr/src/app/init"]
```

#### init

Create an `init` file inside your project directory. This will start your next.js application via `npm run start`.

`<YOUR_PROJECT>/init`

```bash
#!/bin/bash

export DBUS_SYSTEM_BUS_ADDRESS=unix:path=/host/run/dbus/system_bus_socket

sleep 1

while true; do    
    echo "Running"
    npm run start
    sleep 60
done
```

#### Variables

In your balena device variables the `LAUNCH_URL` so it can point to the actual website running via `npm run start`.

```bash
LAUNCH_URL=next-pwa/?preview=live
```

That's it!

You can now deploy your application via `balena push <APP_NAME or DEVICE_IP>`.
