import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";


let port;
let parser;


// Connect Arduino
export function connectArduino() {

    port = new SerialPort({
        path: "COM3", // Change this to your Arduino port
        baudRate: 9600
    });


    parser = port.pipe(
        new ReadlineParser({
            delimiter: "\n"
        })
    );


    port.on("open", () => {
        console.log("Arduino connected");
    });


    port.on("error", (error) => {
        console.log("Arduino error:", error.message);
    });

}


// Receive data from Arduino
export function listenArduino(callback) {

    if (!parser) {
        console.log("Arduino not connected");
        return;
    }


    parser.on("data", (data) => {

        const message = data.trim();

        console.log("Arduino:", message);

        callback(message);

    });

}


// Send command to Arduino
export function sendArduino(command) {

    if (!port) {
        console.log("Arduino not connected");
        return;
    }


    port.write(command + "\n");

}