const stdin = process.openStdin()
const inquirer = require('inquirer');
const gameDef = require('./adventure.json')
const { pipe } = require('pico-lambda')

const quitCmd = 'Quit'
const namePrompt = {
  type: 'input',
  name: 'name',
  message: 'What is your name?',
}
const initialGameState = {
  name: undefined,
  hp: 100,
  maxHp: 100,
  currentRoom: gameDef.startingRoom,
  shouldQuit: false
}

//generic
const debug = (...args) => console.log('~~~~~~~~~~~~ DEBUG ', ...args)

// function compose() {
//   const funcArgs = arguments

//   return function() {
//     let idx = funcArgs.length - 1
//     let result = funcArgs[idx].apply(this, arguments)

//     while(idx--) {
//       result = funcArgs[idx].call(this, result)
//     }
//     return result
//   }
// }

const inform = (msg) => console.log(msg)

function buildRoomPrompt(gameState) {
  return {
    type: 'list',
    name: 'command',
    message: getCurrentRoom(gameState).prompt || 'que?',
    choices: [...getExitsForPrompt(gameState), new inquirer.Separator(), quitCmd]
  }
}

function objMap(obj, cb) {
  return Object.keys(obj).reduce((acc, key) => {
    acc[key] = cb(key, obj[key])
    return acc
  }, {})
}

//game
function getCurrentRoom(gameState) {
  return gameDef.rooms[gameState.currentRoom]
}

function getExitsForPrompt(gameState) {
  return getCurrentRoom(gameState).exits.map(({ name }, idx) => {
    return { name, value: idx }
  })
}

function applyPlayerChanges(gameState, playerChanges) {
  if (!playerChanges) {
    return gameState
  }

  return Object.assign({}, gameState, objMap(playerChanges, (key, value) => {
    return gameState[key] + value
  }))
}

function getPlayerStatus(gameState) {
  const hpPerc = gameState.hp / gameState.maxHp

  if (hpPerc > .75) {
    return "you're feeling great"
  } else if (hpPerc > .5) {
    return "you're not feeling the best"
  } else if (hpPerc > .25) {
    return "you don't feel at all well"
  } else if (hpPerc > 0) {
    return "you had better sit down"
  } else {
    return "are you dead, or is this...Ohio?"
  }
}

//engine
function handleQuit(nothing, gameState) {
  return {
    gameState: Object.assign({}, gameState, { shouldQuit: true }),
    msgs: [`Goodbye, ${gameState.name}.`]
  }
}

function handleNameChange(playerName, gameState) {
  return {
    gameState: Object.assign({}, gameState, { name: playerName }),
    msgs: [`Welcome, ${playerName}!`]
  }
}

function handleRoomExit(index, gameState) {
  try {
    const selectedExit = getCurrentRoom(gameState).exits[index]

    return {
      gameState: Object.assign({}, gameState, applyPlayerChanges(gameState, selectedExit.player), { currentRoom: selectedExit.idx }),
      msgs: [selectedExit.message]
    }
  } catch (error) {
    throw "Bad exit index " + error
  }
}

function exitOnZeroHP({ gameState, msgs }) {
  return {
    gameState: Object.assign({}, gameState, { shouldQuit: gameState.hp <= 0 || gameState.shouldQuit }),
    msgs: msgs
  }
}

function addPromptMessages({ gameState, msgs }) {
  if (gameState.hp <= 0) {
    return {
      gameState,
      msgs: [...msgs, `${gameState.name}, ${getPlayerStatus(gameState)}`, '', 'Nope, you are dead', '', `Goodbye, ${gameState.name}.`]
    }
  } else if (!gameState.shouldQuit) {
    return {
      gameState,
      msgs: [...msgs, '', '', getCurrentRoom(gameState).description, '-----', `${gameState.name}, ${getPlayerStatus(gameState)}`, '']
    }
  }

  return {
    gameState,
    msgs
  }
}

function getCommandHandler(promptResult) {
  if (promptResult.name) {
    return {
      handler: handleNameChange,
      param: promptResult.name
    }
  } else if (promptResult.command !== undefined) {
    if (promptResult.command === quitCmd) {
      return {
        handler: handleQuit,
        param: ''
      }
    } else {
      return {
        handler: handleRoomExit,
        param: promptResult.command
      }
    }
  }
  return {
    handler: () => { },
    param: 'No clue'
  }
}

function promptUser(prompt, currGameState, ...msgs) {
  [...msgs].forEach(inform)

  if (currGameState.shouldQuit) {
    process.exit(0)
  }

  inquirer
    .prompt([prompt])
    .then(getCommandHandler)
    .then(({ handler, param }) => {
      const { gameState, msgs } = compose(
        addPromptMessages,
        exitOnZeroHP,
        handler
      )(param, currGameState)

      promptUser(buildRoomPrompt(gameState), gameState, ...msgs.filter((msg) => msg !== undefined))
    })
    .catch((error) => {
      const { gameState, msgs } = addPromptMessages({ gameState: currGameState, msgs: [`Um, somthing bad happened! (${error})`] })
      promptUser(buildRoomPrompt(gameState), gameState, ...msgs.filter((msg) => msg !== undefined))
    })
}

//setup game
promptUser(namePrompt, initialGameState, `********${gameDef.title}******`)
