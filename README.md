## File Downloader for Balena

This is a simple Express server project that works on any of the [balena][balena-link] supported devices. It can download a specific json file and all connected files and then provides them as a static local (offline) server. It will automatically update the content if changes are available. This can be useful for offline first interactive mediaplayer like [balena-player](https://github.com/wirewirewirewire/balena-player).

### How to use
To get this project up and running, you will need to signup for a balena account [here][signup-page] and set up an application and device. You'll find full details in our [Getting Started tutorial][gettingstarted-link].

Once you have downloaded this project, you can `balena push` it using the [balenaCLI][balena-cli]. This command will package up and push the code to the balena builders, where it will be compiled and built and deployed to every device in the application fleet. When it completes, you'll have a node.js web server running on your device and see some logs on your [balenaCloud dashboard][balena-dashboard].

Set the `BASE_URL` service variable (service: fileupdate) to your endpoint (https://example.com/data.json)

Now the project serves the downloaded json and all connected files:
```
http://fileupdate:3000/config_files.json // The entrypoint json
http://fileupdate:3000/exampleVideo.mp4 // a file defined in the entrypoint json
```

### Coming soon: CURL Endpoint ⚙️

Use `BASE_CURL` instead of `BASE_URL` to download via a custom curl command. This allows you to use authentification, use [GraphQL](https://graphql.org) and more.

```
curl --location 'https://osb.exhibitions.wirewire.de/api/graphql' \
--header 'Content-Type: application/json' \
--data '{"query":"query post($slug: String!) {\n    post(where: {slug: $slug}) {\n      id\n      title\n      slug\n      subtitle\n      content\n      excerpt\n      entries {\n        id\n        title\n        slug\n        content\n     \n      }\n      image {\n        title\n        image { publicUrl }\n      }\n      detailImage {\n        title\n        image { publicUrl }\n      }\n      publishDate\n    }\n  }","variables":{"slug":"album"}}'
```

By addding multiple `curl --filename 'anotherfile.json' --location` you can download more endpoints. Make sure to set `--filename 'name.json'` to name the downloaded content.

### Comming soon: Endpoint list 📦

`BASE_ENDPOINTS` or `BASE_ENDPOINTS_CURL`

By using an endpoint with an endpoint list you can setup a list of downloadable files. Use curl to add a custom request. Use either url or curl ([httpsnippet](https://www.npmjs.com/package/httpsnippet)). If filename is not defined it will try using the original path.

ALTERNATIVE: remain using `BASE_URL` and `BASE_CURL` and trigger the download if a matching object pattern is present in the result (e.g. object containing `filename` and `curl`.

```
[
  {
    "curl": "CURL request",
    "url": "Alternative using an url",
    "filename": "path/to/file.json"
  },
  {
    "curl": "CURL request",
    "url": "Alternative using an url",
    "filename": "path/to/file.json"
  }
]
```

#### Entrypoint json example

```json
{
"id":2,
"Description": "This file will be also downloaded http://www.example.com/mediaFile.mp4",
"file": "http://www.example.com/thisImageIsAlsoDownloaded.jpg",
}
```

![Set variables](https://user-images.githubusercontent.com/3281586/104630113-acdc4080-569a-11eb-9c3e-a83d39c0f88d.png)

### Accessing the file system from your local computer

You can use the tunnel to acces your balena device. The second Port (3011) is the on you can use on your local machine (http://localhost:3011 or http://127.0.0.1:3011).

```
balena tunnel 531bf2675bd2c4_ID_OF_BALENA_DEVICE -p 3000:3011
```

### Accessing from another container inside balena

```
NEXT_PUBLIC_DOWNLOADER_URL=http://downloader:3000
```

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
