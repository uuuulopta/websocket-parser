import * as net from  "net"

interface opcodes{
    [bits:string] : string

}

interface frame{
    fin: string
    opcode: string
    payloadSize: number | bigint
    message: string | Uint8Array

}

interface partialData{
    data: Uint8Array
    toRead: number
    containsCompletedFrame: boolean
}

type bits = string

class WebsocketParser{
    buffers: Map<net.Socket,Uint8Array> = new Map()
    states : Map<net.Socket,string> = new Map()
    onBinary: Function = () => {}
    onText: Function = () => {}
    _isPartialData(data: frame | boolean | Uint8Array | partialData): data is partialData {
        return (data as partialData).toRead !== undefined;
      }
    _isFrame(data: frame | boolean | Uint8Array | partialData): data is frame {
        return (data as frame).message !== undefined;
      }



    _bitsToUnsignedInteger(bits:bits) : number {
        let length = bits.length -1 // Least significat bit position is a 0
        let sum = 0
    
        for(let i=0; i<= length; i++){
            sum += Number(bits[i]) * 2 ** (length-i)
        }
        return sum
    }
    addConnection(socket: net.Socket){
        this.buffers.set(socket,new Uint8Array(1).slice(1))
    }
    removeConnection(socket: net.Socket){
        this.buffers.delete(socket)
    }
    _byteReader(bytes: Uint8Array,from: number | "start", to: number | "end"): Uint8Array {
        // To is included
        if(from == "start") from = 0
        if(to == "end") to = bytes.length
        if(from > to) throw Error("'from' can't be more than 'to'")
        if(bytes.length < from) throw Error("Invalid 'from' position")
        if(bytes.length < to) throw Error("Invalid 'to' position")
        let counter = 0
        let result:Uint8Array= new Uint8Array(to-from)
        for(let i = from; i < to; i++){
            result[counter] = bytes[i]!
            counter++
        }
        return result
    }

    _mergeUint8Array(arr1: Uint8Array,arr2: Uint8Array): Uint8Array {
        let merged = new Uint8Array(arr1.length + arr2.length);
        merged.set(arr1);
        merged.set(arr2, arr1.length);
        return merged
    }

    parseData(bits: Uint8Array): frame | boolean | partialData{ 
    
        //     0                   1                   2                   3
        //     0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
        //    +-+-+-+-+-------+-+-------------+-------------------------------+
        //    |F|R|R|R| opcode|M| Payload len |    Extended payload length    |
        //    |I|S|S|S|  (4)  |A|     (7)     |             (16/64)           |
        //    |N|V|V|V|       |S|             |   (if payload len==126/127)   |
        //    | |1|2|3|       |K|             |                               |
        //    +-+-+-+-+-------+-+-------------+ - - - - - - - - - - - - - - - + //32
        //    |     Extended payload length continued, if payload len == 127  |
        //    + - - - - - - - - - - - - - - - +-------------------------------+ 
        //    |                               |Masking-key, if MASK set to 1  |  
        //    +-------------------------------+-------------------------------+  
        //    | Masking-key (continued)       |          Payload Data         | 
        //    +-------------------------------- - - - - - - - - - - - - - - - +
        //    :                     Payload Data continued ...                :
        //    + - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - +
        //    |                     Payload Data continued ...                |
        //    +---------------------------------------------------------------+
    
        // TODO:  parse ping (maybe)
        let dataLength = bits.length*8
        let length;
        let cursor = 0
        let temp: bits = "";
        let info = ""
        const infoLen = bits.length > 14 ? 14 : bits.length
        for(let i = 0; i<infoLen; i++){
            info+= bits[i]!.toString(2).padStart(8,"0")
        }
        for (let index = 0; index < info.length; index++) {
            const bit = info[index];
        }
        // masking bit
        if(info[8] != '1'){
            return false
        }
        // get the FIN bit
        const fin = info[0]
        // get the opcode
        const opcodes: opcodes = {"0001" : "text", "0010" : "binary", "0000": "continuation"}
        if(!(info.substring(4,8) in opcodes)){
            return false
        }
        const opcode = opcodes[info.substring(4,8)]

        // get the payload size in bytes
        let maskBits: Uint8Array; 
        for (let index = 9; index <= 15; index++) {
            const element = info[index];
            temp+= element
        }      
        maskBits = bits.slice(2,6)
        cursor = 6
        let payloadLengthBits = 7
        length = this._bitsToUnsignedInteger(temp)
        temp = ''
        if(length == 126){
            for (let index = 16; index <= 31; index++) {
                const element = info[index];
                temp+= element
                
            }
            payloadLengthBits = 7 + 16
            length = this._bitsToUnsignedInteger(temp)
            cursor = 8
            maskBits = bits.slice(4,8)

        }
        temp = ''
        if(length == 127){
            for (let index = 16; index <= 79; index++) {
                const element = info[index];

                temp+= element 
            }
            payloadLengthBits = 7 + 64
            length = this._bitsToUnsignedInteger(temp)
            cursor = 14
            maskBits = bits.slice(10,14)

        }

        temp = ""
        
        const frameLength = 9 + payloadLengthBits + 32 + length*8
        console.log(frameLength/8,dataLength/8)
        // received partial data
        if(frameLength > dataLength){
            let partialData = bits 
            let toRead = frameLength/8 - bits.length
            return {
                data: partialData,
                toRead: toRead,
                containsCompletedFrame: false
            }
        }
        if(frameLength < dataLength){
            let partialData = bits 
            let toRead = frameLength/8 
            return {
                data: partialData,
                toRead: toRead,
                containsCompletedFrame: true
            }
        }
        let encoded = this._byteReader(bits,cursor,cursor+length)
        let decoded: Uint8Array | string = encoded.map((el,i) => el ^ maskBits[i % 4]!) as Uint8Array
        if(opcode == "text") decoded = Array.from(decoded,byte => {return String.fromCharCode(byte)}).join("")
        return {
            fin: fin!,
            opcode: opcode!,
            payloadSize: length,
            message: decoded,
        }

    }

    parse(data: Buffer,socket: net.Socket) {
        let buffer = this.buffers.get(socket)
        if(buffer == undefined) throw Error("No such socket found")
        if(buffer.length == 0){
            let parsedFrame = this.parseData(data)
            // if data received is not a frame it means that the frame is incomplete so we add it to the buffer
            if(!this._isFrame(parsedFrame)) buffer = data
            else if(this._isFrame(parsedFrame)){
               this._handleResult(parsedFrame)
            }
        }
        else if(buffer.length > 0  ){
            let lastBuffer = new Uint8Array(1).slice(1)
            buffer = this._mergeUint8Array(buffer,data)
            while(true){
                if(buffer == lastBuffer) break
                lastBuffer = buffer
                let tryParse = this.parseData(buffer)
                if(this._isFrame(tryParse)){
                    this._handleResult(tryParse)
                    buffer = new Uint8Array(1).slice(1)
                }
                else if(this._isPartialData(tryParse) && tryParse.containsCompletedFrame){
                    var frameBytes = this._byteReader(tryParse.data,"start",tryParse.toRead) 
                    let parsedFrameBytes = this.parseData(frameBytes)
                    if(!this._isFrame(parsedFrameBytes)) {throw Error("not a frame xdxxdxd")}
                    this._handleResult(parsedFrameBytes)
                    buffer = buffer.slice(frameBytes.length)
                }
                else if(this._isPartialData(tryParse) && tryParse.containsCompletedFrame == false){
                    // nothing
                }
            }
        }
        
       this.buffers.set(socket,buffer)
    }
    on(frameType: "binary" | "text",callback : (data: Uint8Array | string) => void){
        if(frameType == "binary"){
            this.onBinary = callback
        }
        if(frameType == "text"){
            this.onText = callback
        }
    }
    _handleResult(frame: frame){
        if(frame.opcode == "binary"){
            this.onBinary(frame.message)
        }
        if(frame.opcode == "text"){
            this.onText(frame.message)
        }
    }
    


}

export  {WebsocketParser}