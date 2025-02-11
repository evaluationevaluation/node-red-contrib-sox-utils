/**
 * Copyright 2020 Johannes Kropf
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/
module.exports = function(RED) {

    const { spawn } = require("child_process");
    const { exec } = require("child_process");
    const fs = require("fs");
    
    function SoxPlayNode(config) {
        RED.nodes.createNode(this,config);
        this.statusTimer = false;
        this.statusTimer2 = false;
        this.outputDeviceRaw = config.outputDevice;
        this.manualOutput = config.manualOutput;
        this.outputDevice = "plughw:";
        this.gain = config.gain + "dB";
        this.debugOutput = config.debugOutput;
        this.argArr = [];
        this.startNew = config.startNew;
        this.killNew = false;
        this.newPayload = "";
        this.queue = [];
        this.playingNow;
        this.fileId = "";
        this.filePath = "";
        this.shm = true;
        this.addN = 0;
        this.lastMsg = {};
        this.linux = true;
        this.inputTimeout = false;
        this.playStream = config.playStream;
        this.inputEncoding = config.inputEncoding;
        this.inputChannels = config.inputChannels;
        this.inputRate = config.inputRate;
        this.inputBits = config.inputBits;
        var node = this;
        
        function node_status(state1 = [], timeout = 0, state2 = []){
            
            if (state1.length !== 0) {
                node.status({fill:state1[1],shape:state1[2],text:state1[0]});
            } else {
                node.status({});
            }
            
            if (node.statusTimer !== false) {
                clearTimeout(node.statusTimer);
                node.statusTimer = false;
            }
            
            if (timeout !== 0) {
                node.statusTimer = setTimeout(() => {
                
                    if (state2.length !== 0) {
                        node.status({fill:state2[1],shape:state2[2],text:state2[0]});
                    } else {
                        node.status({});
                    }
                    
                    node.statusTimer = false;
                    
                },timeout);
            }
            
        }
        
        function guessFormat(input){
            
            const formats = [
                [["aiff"],[0x46,0x4F,0x52,0x4D,0x00]],
                [["wav"],[0x52,0x49,0x46,0x46]],
                [["flac"],[0x66,0x4C,0x61,0x43]],
                [["ogg"],[0x4F,0x67,0x67,0x53,0x00,0x02,0x00,0x00]],
                [["mp3"],[0x49,0x44,0x33]],
                [["mp3"],[0xFF,0xFB]]
            ];
            const result = formats.filter(element => input.includes(Buffer.from(element[1])));
            if (result.length === 0) { return false; }
            return result[0][0];
            
        }
        
        function playQueue(){
            
            let queueItem = node.queue.shift();
            node.argArr = [];
            if (!node.debugOutput) { node.argArr.push('-q'); }
            node.argArr.push(queueItem.trim());
            if (node.outputDeviceRaw === "default") {
                node.argArr.push("-d")
            } else if (node.outputDeviceRaw === "manualOutput") {
                let manualOutputDevice = node.manualOutput.trim().split(" ");
                node.argArr = node.argArr.concat(manualOutputDevice);
            } else {
                node.argArr.push('-t','alsa',node.outputDevice);
            }
            node.argArr.push('vol',node.gain);
            spawnPlay();
            if (node.queue.lenght === 0) { node.addN = 0; }
            return;
            
        }
        
        function spawnPlay(){ 
            
            try{
                node.soxPlay = spawn("sox",node.argArr);
            } 
            catch (error) {
                node_status(["error starting play command","red","ring"],1500);
                node.error(error);
                return;
            }
            
            if (node.queue.length === 0) {
                node_status(["playing","blue","dot"]);
            } else {
                node_status(["playing | " + node.queue.length + " in queue","blue","dot"]);
            }
            
            node.soxPlay.stderr.on('data', (data)=>{
            
                node.lastMsg.payload = data.toString();
                node.send(node.lastMsg);
                
            });
            
            node.soxPlay.on('close', function (code,signal) {
                
                node.lastMsg.payload = "complete";
                node.send(node.lastMsg);
                node_status(["finished","green","dot"],1500);
                delete node.soxPlay;
                if (node.queue.length !== 0) {
                    playQueue();
                } else if (!node.killNew) {
                    node.argArr = [];
                    if (!node.debugOutput) { node.argArr.push('-q'); }
                } else {
                    node.killNew = false;
                    spawnPlay();
                }
                return;
                
            });
            
            node.soxPlay.stdout.on('data', (data)=>{
                
            });
            return;
        
        }
        
        function spawnPlayStream(){
            
            node.argArr = ["-t","raw","-e",node.inputEncoding,"-c",node.inputChannels,"-r",node.inputRate,"-b",node.inputBits,"-"];
            if (node.outputDeviceRaw === "default") {
                node.argArr.push("-d")
            } else if (node.outputDeviceRaw === "manualOutput") {
                let manualOutputDevice = node.manualOutput.trim().split(" ");
                node.argArr = node.argArr.concat(manualOutputDevice);
            } else {
                node.argArr.push('-t','alsa',node.outputDevice);
            }
            node.argArr.push('vol',node.gain);
            try{
                node.soxPlayStream = spawn("sox",node.argArr);
            } 
            catch (error) {
                node_status(["error starting play command","red","ring"],1500);
                node.error(error);
                return;
            }
            node_status(["playing stream","blue","dot"]);
            
            node.soxPlayStream.stderr.on('data', (data)=>{
            
                node.lastMsg.payload = data.toString();
                node.send(node.lastMsg);
                
            });
            
            node.soxPlayStream.on('close', function (code,signal) {
                
                node.lastMsg.payload = "complete";
                node.send(node.lastMsg);
                node_status(["finished","green","dot"],1500);
                delete node.soxPlayStream;
                return;
                
            });
            
            node.soxPlayStream.stdout.on('data', (data)=>{
                
            });
            return;
        
        }
        
        function writeStdin(chunk){
            
            try {
                node.soxPlayStream.stdin.write(chunk);
            }
            catch (error){
                node.error("couldn't write to stdin: " + error);
                node_status(["error writing chunk","red","dot"],1500);
            }
            return;
            
        }
        
        function inputTimeoutTimer(){
            if (node.inputTimeout !== false) {
                clearTimeout(node.inputTimeout);
                node.inputTimeout = false;
            }
            node.inputTimeout = setTimeout(() => {
                node.soxPlayStream.stdin.destroy();
                node.inputTimeout = false;
            }, 1000);
        }
        
        node_status();
        
        if (process.platform !== 'linux') {
            node.linux = false;
            node.error("Error. This node only works on Linux with ALSA and Sox.");
            node_status(["platform error","red","ring"]);
            return;
        }
        
        node.fileId = node.id.replace(/\./g,"");
        
        if (!fs.existsSync('/dev/shm')) { node.shm = false; }
        
        if (node.outputDeviceRaw === 'default') {
            node.outputDevice = node.outputDeviceRaw;
        } else {
            node.outputDevice += node.outputDeviceRaw.toString();
        }
        
        if (!node.debugOutput) { node.argArr.push('-q'); }
        
        node.on('input', function(msg, send, done) {
            
            if (!node.linux) {
                (done) ? done("Error. This node only works on Linux with ALSA and Sox.") : node.error("Error. This node only works on Linux with ALSA and Sox.");
                node_status(["platform error","red","ring"]);
                return;
            }
            
            if (typeof msg.payload === "string" && msg.payload.length === 0) {
                    (done) ? done("String input was empty") : node.error("String input was empty");
                    return;
            }
            
            node.lastMsg = msg;
            
            if (node.playStream) {
                if (Buffer.isBuffer(msg.payload)) {
                    if (!node.soxPlayStream) {
                        if (msg.hasOwnProperty("bits") && msg.hasOwnProperty("channels") && msg.hasOwnProperty("encoding") && msg.hasOwnProperty("rate")){
                            node.inputBits = msg.bits;
                            node.inputChannels = msg.channels;
                            node.inputEncoding = msg.encoding;
                            node.inputRate = msg.rate;
                        }
                        spawnPlayStream();
                        // without the following line my NodeRed on RPI400 did not play streams (coming from pico2wave node)
                        // sox always compained empty stream...
                        writeStdin(msg.payload);
                        // end of patch
                    } else {
                        writeStdin(msg.payload);
                    }
                    inputTimeoutTimer();
                } else if (!Buffer.isBuffer(msg.payload)) {
                    node.warn("if in stream mode input payloads need to be a stream of raw audio buffers");
                    if (done) { done(); }
                    return;
                }
                
            } else {
            
                if (Buffer.isBuffer(msg.payload)) {
                    if (msg.payload.length === 0) {
                        (done) ? done("empty buffer") : node.error("empty buffer");
                        node_status(["error","red","dot"],1500);
                        return;
                    }
                    const testBuffer = msg.payload.slice(0,8);
                    let testFormat = guessFormat(testBuffer);
                    if (!testFormat) {
                        if (!msg.hasOwnProperty("format")) {
                            (done) ? done("msg with a buffer payload also needs to have a coresponding msg.format property") : node.error("msg with a buffer payload also needs to have a coresponding msg.format property");
                            node_status(["error","red","dot"],1500);
                            return;
                        }
                        testFormat = msg.format;
                    }
                    node.filePath = (node.shm) ? "/dev/shm/" + node.fileId + node.addN + "." + testFormat : "/tmp/" + node.fileId + node.addN +"." + testFormat;
                }
                
                if (msg.payload === 'stop' && node.soxPlay) {
                    node.queue = [];
                    node.soxPlay.kill();
                } else if (msg.payload === 'stop' && !node.soxPlay) {
                    node.warn('not playing');
                } else if (msg.payload === 'clear' && node.queue.length !== 0) {
                    node.queue = [];
                    msg.payload = 'queue cleared';
                    (send) ? send(msg) : node.send(msg);
                    node_status(["playing","blue","dot"]);
                } else if (msg.payload === 'clear' && node.queue.length === 0) {
                    node.warn('queue is already empty');
                } else if (msg.payload === 'next' && node.queue.length !== 0) {
                    node.soxPlay.kill();
                } else if (msg.payload === 'next' && node.queue.length === 0) {
                    node.warn('no other items in the queue');
                } else if (!node.soxPlay && typeof msg.payload === 'string') {
                    node.argArr.push(msg.payload.trim());
                    if (node.outputDeviceRaw === "default") {
                        node.argArr.push("-d")
                    } else if (node.outputDeviceRaw === "manualOutput") {
                        let manualOutputDevice = node.manualOutput.trim().split(" ");
                        node.argArr = node.argArr.concat(manualOutputDevice);
                    } else {
                        node.argArr.push('-t','alsa',node.outputDevice);
                    }
                    node.argArr.push('vol',node.gain);
                    spawnPlay();
                } else if (!node.soxPlay && Buffer.isBuffer(msg.payload)) {
                    try {
                        fs.writeFileSync(node.filePath, msg.payload);
                    } catch (error) {
                        (done) ? done("couldnt write tmp file") : node.error("couldnt write tmp file");
                        return;
                    }
                    node.argArr.push(node.filePath,'-t','alsa',node.outputDevice,'vol',node.gain);
                    spawnPlay();
                } else if (node.soxPlay && node.startNew === 'start') {
                    node.argArr = [];
                    if (!node.debugOutput) { node.argArr.push('-q'); }
                    if (typeof msg.payload === 'string') {
                        node.argArr.push(msg.payload.trim());
                        if (node.outputDeviceRaw === "default") {
                            node.argArr.push("-d")
                        } else if (node.outputDeviceRaw === "manualOutput") {
                            let manualOutputDevice = node.manualOutput.trim().split(" ");
                            node.argArr = node.argArr.concat(manualOutputDevice);
                        } else {
                            node.argArr.push('-t','alsa',node.outputDevice);
                        }
                        node.argArr.push('vol',node.gain);
                    } else if (Buffer.isBuffer(msg.payload)) {
                        try {
                            fs.writeFileSync(node.filePath, msg.payload);
                        } catch (error) {
                            (done) ? done("couldnt write tmp file") : node.error("couldnt write tmp file");
                            return;
                        }
                        node.argArr.push(node.filePath);
                        if (node.outputDeviceRaw === "default") {
                            node.argArr.push("-d")
                        } else if (node.outputDeviceRaw === "manualOutput") {
                            let manualOutputDevice = node.manualOutput.trim().split(" ");
                            node.argArr = node.argArr.concat(manualOutputDevice);
                        } else {
                            node.argArr.push('-t','alsa',node.outputDevice);
                        }
                        node.argArr.push('vol',node.gain);
                    }
                    node.newPayload = msg.payload;
                    node.killNew = true;
                    node.soxPlay.kill();
                } else if (node.soxPlay && node.startNew === 'queue') {
                    if (Buffer.isBuffer(msg.payload)) {
                        try {
                            fs.writeFileSync(node.filePath, msg.payload);
                        } catch (error) {
                            (done) ? done("couldnt write tmp file") : node.error("couldnt write tmp file");
                            return;
                        }
                        node.queue.push(node.filePath);
                    } else {
                        node.queue.push(msg.payload);
                    }
                    if (node.queue.length === 1) {
                        msg.payload = 'added to queue. There is now ' + node.queue.length + ' file in the queue.';
                        (send) ? send(msg) : node.send(msg);
                    } else {
                        msg.payload = 'added to queue. There is now ' + node.queue.length + ' files in the queue.';
                        (send) ? send(msg) : node.send(msg);
                    }
                    node_status(["playing | " + node.queue.length + " in queue","blue","dot"]);
                } else {
                    node.warn('ignoring input as there is already a playback in progress');
                }
                if (node.startNew === "queue") { node.addN += 1; }
            }
            
            if (done) { done(); }
            return;
        });
        
        node.on("close",function() {
            
            try {
                node.soxPlay.kill();
            } catch (error) {}
            
            node_status();
            
            node.queue = [];
            
            if (node.linux) {
                const checkDir = (node.shm) ? "/dev/shm/" : "/tmp/";
                fs.readdir(checkDir, (err,files) => {
                    if (err) { node.error("couldnt check for leftovers in " + checkDir); return; }
                    files.forEach(file => {
                        if (file.match(node.fileId)) {
                            try {
                                fs.unlinkSync(checkDir + file);
                            } catch (error) {
                                node.error("couldnt delete leftover " + file);
                            }
                        }
                    });
                    return;
                });
            }
            
        });
        
    }
    RED.nodes.registerType("sox-play",SoxPlayNode);

    RED.httpAdmin.get("/soxPlay/devices", RED.auth.needsPermission('sox-play.read'), function(req,res) {
        try {
            exec('aplay -l', (error, stdout, stderr) => {
                if (error) {
                    res.json("error");
                    console.log(error)
                    return;
                }
                if (stderr) {
                    res.json("error");
                    console.log(stderr);
                    return; 
                }
                if (stdout) {
                    let deviceArr = stdout.split("\n");
                    deviceArr = deviceArr.filter(line => line.match(/card/g));
                    deviceArr = deviceArr.map(device => {
                        let deviceObj = {};
                        deviceObj.name = device.replace(/\s\[[^\[\]]*\]/g, "");
                        deviceObj.number = device.match(/[0-9](?=\:)/g);
                        return deviceObj;
                    });
                    res.json(deviceArr);
                }
            });
        } catch (error) {
            res.json("error");
            console.log(error);
        }
        
    });
}
