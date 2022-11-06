# Camera Connection

## About

Package for connecting with Pi-Eye camera

### Built With

* NodeJS
* TypeScript

## Getting Started

### Prerequisites

1. [Node](https://nodejs.org/en/) and npm

### Installation

1. Install NPM package: camera-interface
    ```sh
    npm install https://github.com/Pi-Eye/camera-connection
    ```

## Usage

### Example Camera Interface

```js
import { CameraSide, ClientSide } from "camera-connection";

const port = 8080;        // port to listen on
const hash_file_location; // location of json file containing hash of password to authenticate
const all_settings;       // All settings of Pi-Eye camera

const camera_side = new CameraSide(port, hash_file_location, all_settings);

const config_file_location;  // location of json file containing address and password to authenticate
const client_side = new ClientSide(config_file_location)
```

## License

Distributed uner the GPL-3.0 License. See `LICENSE.txt` for more information.

## Contact

Bennett Wu - bwu1324@gmail.com