const app = require('express')();
const server = require('http').createServer(app);
const https = require('https');
const io = require('socket.io')(server);
const { log } = require('console');
const { stat } = require('fs');
const fetch = require('node-fetch');
const { Headers } = require('node-fetch');
const util = require('util');
const { Agent } = require('http');

const options = {
    pre: 'https://',
    api: '.wikipedia.org/w/api.php',
    format: 'format=json',
    cors: 'origin=*'
}

const httpsAgent = new https.Agent({
    keepAlive: true,
})

const meta = {
    "User-Agent": "Wikirace/0.5 FunLittleProject-RecreatingTheGameWikiRace"
}

const header = new Headers(meta);

const fetchOptions = {
    headers: header,
    agent: httpsAgent,
}

let LOBBIES = {};

class Lobby {
    constructor() {
        this.id = Math.floor(Math.random() * 100000);
        this.members = new Set();
        this.ready = new Set();
        LOBBIES[this.id] = this;
    }

    addMember(socket) {
        this.members.add(socket);
    }

    removeMember(socket) {
        this.members.delete(socket);
    }

    getUsernames() {
        let names = new Set();
        this.members.forEach(x => {
            names.add(x.username || (`User${Math.floor(Math.random() * 100)}`));
        })

        return names;
    }

    setReady(socket) {
        this.ready.add(socket);
    }

    unReady(socket) {
        this.ready.delete(socket);
    }

    emit(message, data) {
        this.members.forEach((x, i) => {
            x.emit(message, data);
        })
    }
}

/*-------------------------------------------------------------------------------------------------------
SETUP
-------------------------------------------------------------------------------------------------------*/

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/client/index.html');
})

app.get('/game/:id', (req, res) => {
    if (LOBBIES.hasOwnProperty(req.params.id)) {
        res.sendFile(__dirname + '/client/register.html');
    } else {
        res.redirect('/');
    }
})

server.listen(5000, () => {
    console.log('listening on port 3000');
})

/*-------------------------------------------------------------------------------------------------------
FUNCTIONS
-------------------------------------------------------------------------------------------------------*/
async function getRandom(language) {
    const randQuery = `${options.pre}${language}${options.api}?action=query&${options.format}&list=random&rnnamespace=0&rnlimit=2&${options.cors}`;

    let url;
    let status = false;
    let randoms;
    while (!status) {
        randoms = await fetch(randQuery, fetchOptions)
            .then(response => {
                if (response.status !== 200) {
                    getRandom(language);
                    throw new Error('first fetch failed');
                }
                return response.json()
            })
            .then(data => data.query.random)
            .then(articles => {
                url = `${options.pre}${language}${options.api}?action=query&${options.format}&generator=backlinks&gblpageid=${articles[1].id}&${options.cors}`;
                return articles;
            })
        let theChosenTwo = await fetch(url, fetchOptions)
            .then(response => {
                if (response.status !== 200) {
                    console.log(util.inspect(response, { showHidden: false, depth: null }));
                }
                return response.json();
            })
            .then(data => data.query.pages)
            .then(backlinks => {
                if (!backlinks || backlinks.length < 1) {
                } else {
                    console.log('FOUND SOMETHING!!');
                    status = true;
                }
            }).catch(err => console.log(err))
    }

    console.log(randoms);

    return randoms;
}

function urlEncode(string) {
    return encodeURI(string);
}

async function getSite(pageName, language = 'de') {
    let page = urlEncode(pageName);
    /*     console.log(page); */
    let data = await fetch(`${options.pre}${language}${options.api}?action=parse&${options.format}&page=${page}&prop=text&formatversion=2&${options.cors}`, fetchOptions)
        .then(response => {
            return response.json()
        })
        .then(data => data)
        .catch(err => {
            console.log("ERROR in GET SITE: " + err + "\n Tryin again...");
            global.setTimeout(() => {
                getSite(pageName, language);
            }, 50);
        });

    return data;
}

/*-------------------------------------------------------------------------------------------------------
EVENT HANDLING
-------------------------------------------------------------------------------------------------------*/

io.on('connection', (socket) => {
    console.log('a user has connected');

    socket.emit('connected');

    //Is triggered, when a user uses the Game Join Link.
    socket.on('lobbyInfo', ({ id, username }) => {
        if (LOBBIES.hasOwnProperty(id, username)) {
            socket.username = username;
            socket.lobbyID = id;
            LOBBIES[id].addMember(socket);
            let usernames = LOBBIES[id].getUsernames();
            LOBBIES[id].emit('usernames', Array.from(usernames));
        }
    });

    //Is triggered, when a User requests to be put into a new Lobby
    socket.on('requestLobby', (username) => {
        let lobby = new Lobby();
        LOBBIES[lobby.id].addMember(socket);
        console.log(LOBBIES);
        socket.username = username;
        socket.lobbyID = lobby.id;
        socket.emit('lobbyID', lobby.id);
    });

    socket.on('ready', (id, username) => {
        LOBBIES[id].setReady(socket);
        console.log("MEMBER LENGTH" + LOBBIES[id].members.size, "READY LENGTH" + LOBBIES[id].ready.size);

        //CHECK IF ALL USERS ARE READY, IF YES THEN START
        if (LOBBIES[id].members.size === LOBBIES[id].ready.size) {
            getRandom('de').then(article => {
                getSite(article[0].title, 'de')
                    .then(data => {
                        LOBBIES[id].emit('gameInfo', { article, data })
                    })
            })
        }
    })

    socket.on('startRandom', (language) => {
        getRandom(language)
            .then(article => {
                getSite(article[0].title, language).then(data => {
                    io.emit('gameInfo', { article, data });
                });
            }).catch(err => console.log(err))
    });

    socket.on('finished', () => {

    });

    socket.on('disconnect', () => {
        if(LOBBIES[socket.lobbyID]){
            LOBBIES[socket.lobbyID].removeMember(socket);

            if(LOBBIES[socket.lobbyID].members.size < 1){
                console.log("Lobby was deleted, because it was empty");
                delete LOBBIES[socket.lobbyID];
            }
        }

    })
})




