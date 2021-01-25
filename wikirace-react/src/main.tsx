import React, { useEffect } from 'react';
import openSocket from 'socket.io-client';

export default function Main(){

    useEffect(()=>{
        const io = openSocket('http://localhost:5000',{transports: ['websocket']});
        console.log(io);
        io.on('connected', ()=>{
            console.log('HEllo')
        })
    },[])

    return(
        <main>

        </main>
    )
}