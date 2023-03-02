Work in progress.

## Usage 

Import package
```typescript
import * as net from "net"
import { WebsocketParser } from "nodejs-websocket-parser/dist/WebsocketParser"
```

Initialize parser
```typescript
const wsp = new WebsocketParser()
```

On socket connection, add it to the parser
```typescript
wsp.addConnection(socket)
```

On socket disconnect, remove it
```typescript
wsp.removeConnection(socket)
```

When you recieve data from socket parse it with
```typescript
wsp.parse(data,socket)
```

Handle parsed data with 
```typescript
wsp.on("text",(data) => {console.log(data)})  
wsp.on("binary",(data) => {console.log(data)})
```
