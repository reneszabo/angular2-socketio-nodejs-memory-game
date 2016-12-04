/* ### GLOBAL VARIALBES  ######################################################################################## ### */
var express       = require('express');               // express framework
var app           = express();                        // instance of express
var http          = require('http').Server(app);      // http functions attaching express
var io            = require('socket.io')(http);       // instance socketio
var socketioJwt   = require('socketio-jwt');          // jwt functions
var _             = require('lodash');                // Awesome tool - multi use tool form variables
var jwt           = require('jsonwebtoken');          // get jwt from request functions
var cors          = require('cors');                  // Allow request from other websites
var bodyParser    = require('body-parser');           // Parse variables passed into req.body as an object
var uuid          = require('node-uuid');             // Unique id generator.
var config        = require('./config');              // my config file
var cardsArray    = null;
var users         = [{ id: uuid.v1(), username: 'Rene', isOnline: false, score: 500 }];
var cardsSelected = [];

/* ### GLOBAL CONFIG  ########################################################################################### ### */
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cors());

/* ### SERVER  ################################################################################################## ### */
// Public Assets
app.use(express.static(__dirname + '/../dist'));
app.get('/', function(req, res){
  res.sendFile(__dirname + '/../dist/index.html');
});
app.post('/user/create', function(req, res) {
  var userScheme = getUserScheme(req);
  if(userScheme.username === undefined){
    return res.status(401).send({message: "Please set user name"});
  }
  var user = _.find(users, userScheme.userSearch);
  if (user) {
    if(user.isOnline===true){
      return res.status(401).send({message: "User is already in the page.", user: user});
    }else{
      user.isOnline = true;
    }
  }else{
    user = { id: uuid.v1(), username: userScheme.username, isOnline: true };
  }
  users.push(user);
  res.status(201).send({
    id_token: createToken(user),
    username: userScheme.username
  });
});
http.listen(8889, function(){
  console.log('listening on *:8889');
  resetCards();
});
/* ### SOCKET IO ################################################################################################ ### */
/* --- SOCKET IO JWT TOKEN LISTENER SETTINGS -------------------------------------------------------------------- --- */
io.use(socketioJwt.authorize({
  secret: config.secret,
  handshake: true
}));
/* --- SOCKET IO LISTENERS -------------------------------------------------------------------------------------- --- */
io.on('connection', function(socket){
  console.log('------------------------------------------------------------------------------------------------------');
  console.log('| socket.io connection established                                                                   |');
  console.log('------------------------------------------------------------------------------------------------------');
  var user = socket.decoded_token;
  socket.userid = user.id;
  socket.username = user.username;
  socket.emit('login', {numUsers: 1});
  var userFromMemory = _.find(users, ['id', user.id]);
  if(userFromMemory === undefined){
    userFromMemory = { id: user.id, username: user.username, isOnline: true, score: 0 };
    users.push(userFromMemory);
  }else{
    userFromMemory.isOnline = true;
  }
  console.log(userFromMemory);
  socket.emit('UserAll', users);
  // sendPlayer(userFromMemory);
  /* --- USER SCORE LISTENERS ----------------------------------------------------------------------------------- --- */
  function sendPlayer(user){
    socket.emit('UsersSingle', JSON.stringify(user));
    socket.broadcast.emit('UserSingle', JSON.stringify(user)); // Send message to everyone BUT sender
  }
  /* --- CHAT MESSAGES LISTENERS -------------------------------------------------------------------------------- --- */
  socket.on('SendMessage', function (msg) {
    console.log('noticed new message');
    console.log(msg);
    var parsedMsg = JSON.parse(msg);
    socket.emit('MessageReceived', parsedMsg.id); // Send message to sender
    socket.broadcast.emit('NewMessage', msg); // Send message to everyone BUT sender
  });

  /* --- GAME LISTENERS ----------------------------------------------------------------------------------------- --- */
  socket.on('CardClicked', function (msg) {
    console.log('noticed new card click');
    var parsedMsg = JSON.parse(msg);
    var card = _.find(cardsArray, ['id', parsedMsg.id]);
    var user = _.find(users, ['id', parsedMsg.userId]);
    var playerSelectedCards = cardsSelected[user.id];
    if(playerSelectedCards === undefined){
      playerSelectedCards = [];
      cardsSelected[user.id] = playerSelectedCards;
    }
    console.log(card);
    if(card.state === false && playerSelectedCards.length<2){
      card.state = true;
      card.userId = user.id;
      card.username = user.username;
      socket.emit('CardStatus', JSON.stringify(card)); // Send message to sender
      socket.broadcast.emit('CardStatus', JSON.stringify(card)); // Send message to everyone BUT sender
      playerSelectedCards.push(card);
      if(playerSelectedCards.length>=2){
        var cardOne = playerSelectedCards.pop();
        var cardTwo = playerSelectedCards.pop();
        if(cardOne.image != cardTwo.image ){
          cardOne.state = false;
          cardTwo.state = false;
          cardOne.userId = null;
          cardTwo.userId = null;
          cardOne.username = null;
          cardTwo.username = null;
        }else{
          cardOne.lock = true;
          cardTwo.lock = true;
          user.score = user.score*1+10;
          // sendPlayer(user);
        }
        setTimeout(function(){
          socket.emit('CardStatus', JSON.stringify(cardOne)); // Send message to sender
          socket.broadcast.emit('CardStatus', JSON.stringify(cardOne)); // Send message to everyone BUT sender
          socket.emit('CardStatus', JSON.stringify(cardTwo)); // Send message to sender
          socket.broadcast.emit('CardStatus', JSON.stringify(cardTwo)); // Send message to everyone BUT sender
        },1000);
        var somethingLeft = _.find(cardsArray, ['lock', false]);
        if(somethingLeft === undefined){
          setTimeout(function(){
            newGame();
          },5000);
        }
      }
    }
  });
  socket.on('CardNewGame', function (msg) {
    console.log('noticed new game');
    newGame();
  });
  socket.on('CardCurrentGame', function (msg) {
    socket.emit('CardNewGameReceived', cardsArray); // Send message to sender
  });
  /* --- DEFAULT LISTENERS -------------------------------------------------------------------------------------- --- */
  socket.on('Logout', function (msg) {
    console.log('noticed Logout');
    var parsedMsg = JSON.parse(msg);
    notifyLogout(putUserOffline(parsedMsg.id));
  });
  socket.on('disconnect', function () {
    console.log('noticed disconnect');
    console.log(socket.userid );
    notifyLogout(putUserOffline(socket.userid));
  });

  /* --- SOCKET IO GLOBAL FUNCTIONS  ---------------------------------------------------------------------------- --- */
  function sendAllUserSortedByScore(){

  }


  /**
   * Emit broatcast that user left the chat
   * @param userFound
   */
  function notifyLogout(userFound){
    if(userFound !== false){
      // echo globally that this client has left
      socket.broadcast.emit('user left', {
        username: socket.username,
        numUsers: 1
      });
    }
  }
  /**
   * * Emit broatcast New Game has been created
   */
  function newGame(){
    var cards = resetCards();
    socket.emit('CardNewGameReceived', cards); // Send message to sender
    socket.broadcast.emit('CardNewGameReceived', cards); // Send message to everyone BUT sender
  }
});

/* ### GLOBAL FUNCTIONS  ######################################################################################## ### */
/**
 * Puts user with status offline
 * @param id string
 * @returns {boolean || User}
 */
function putUserOffline(id){
  var userFound = _.find(users, ['id',id]);
  console.log("PutUserOffline");
  if(userFound !== undefined &&  userFound !== -1 ){
    userFound.isOnline = false;
    console.log(userFound);
    return userFound;
  }
  console.log(userFound);
  return false;
}
/**
 * Resets cards array and clears the selected card from user array
 * @returns array
 */
function resetCards(){
  cardsSelected = [];
  cardsArray = [
    { id: uuid.v1(), image: "1",  userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "1",  userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "2",  userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "2",  userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "3",  userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "3",  userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "4",  userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "4",  userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "5",  userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "5",  userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "6",  userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "6",  userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "7",  userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "7",  userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "8",  userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "8",  userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "9",  userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "9",  userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "10", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "10", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "11", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "11", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "12", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "12", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "13", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "13", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "14", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "14", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "15", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "15", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "16", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "16", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "17", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "17", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "18", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "18", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "19", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "19", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "20", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "20", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "21", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "21", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "22", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "22", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "23", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "23", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "24", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "24", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "25", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "25", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "26", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "26", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "27", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "27", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "28", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "28", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "29", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "29", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "30", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "30", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "31", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "31", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "32", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "32", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "33", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "33", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "34", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "34", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "35", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "35", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "36", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "36", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "37", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "37", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "38", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "38", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "39", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "39", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "40", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "40", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "41", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "41", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "42", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "42", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "43", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "43", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "44", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "44", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "45", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "45", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "46", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "46", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "47", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "47", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "48", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "48", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "49", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "49", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "50", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
    { id: uuid.v1(), image: "50", userId: null, username: null, datetime: null, state: false, lock: false, isLoading: false },
  ];
  cardsArray = _.shuffle(cardsArray);
  return cardsArray;
}
/**
 * Creates JWT Token for user to use as a validation entry token
 *
 * @param user
 * @returns string
 */
function createToken(user) {
  return jwt.sign(user, config.secret, { expiresIn: "10h" });
  // return jwt.sign(user, config.secret, { expiresIn: 10 });
}
/**
 *
 * @param req request
 * @returns {{username: *, type: *, userSearch: {}}}
 */
function getUserScheme(req) {
  var username;
  var type;
  var userSearch = {};
  // The POST contains a username and not an email
  if(req.body.username) {
    username = req.body.username;
    type = 'username';
    userSearch = { username: username };
  }
  return {
    username: username,
    type: type,
    userSearch: userSearch
  }
}
