# betya

betya is a platform where users can securely and anonymously bet on micro-events in sports, politics, and more.

## Product Overview

### Development Phases

* Stage One: users can offer and take odds on a pre-populated set of events, likely coming from live baseball games. For example: if the Yankees are playing the Dodgers, and Puig is up to bat against Mariano Rivera (notice my lack of temporal locality), I could offer 2:1 odds that the next pitch wwill result in a strike. 
* Stage Two: betya offers odds on the aformentioned events by piping all historical baseball data in existence through a dueling LSTM neural network that will calculate the odds of success from both "sides" of an event. For example, in the previous case, the Rivera model may say 20% strike, and the Puig model may say 40% hit - those two metrics can be combined to create a reliable set of odds.
* Stage Three: betya allows for odds on *anything*. Users can serve as either the provider, consumer, or arbitrator of a bet. Arbitration is anonymous and arbitrators have the task of confirming the result of a bet. False confirmations will result in a lack of reputation score and therefore a lack of providers/consumers willing to "hire" said person as an arbitrator.

The key to betya's success will be the usage of an internal blockchain for all transactions on the platform. This will allow for audit, verification, and fraud prevention across all bets. 

### User Flow

1. Register with a bitcoin address and user profile. No physical bank accounts. 
2. Place a bet, putting your bitcoin in escrow, or provide a bet, with a maximum covered amount placed in escrow.
3. Upon expirty of event, funds are moved out of escrow back into respective accounts. 

For specific views and their documentation/specifications, please see the [docs](https://github.com/sachabest/betya/tree/master/docs/specs) folder.

### Monetization

Monetization will happen in four stages:

1. The house takes a small percentage of every transaction.
2. Bets placed against house-provided odds will incur an additional fee.
3. In arbitrated bets, the transaction percentage is higher, with a certian proportion of those proceeds going to the arbitrator. These percentages rise in accordance with the total covered amount of the provider.
4. Once the platform is fully established, different event and sport organizations can opt to provide us with first-party data in exchange for kickbacks on bets on that data. This will allow us to make money on both ends of the platform - from data provider to us and from us to user. 

## Tools, Resources, and Techniques

### Technical Infrastracture

* Backend: Flask
* Frontend: React
* Wallet Provider: [MetaMask](https://metamask.io/) (in browser)
* Contract Provider: Truffle

### Resoruces

* Data for baseball (initial sport) will be provided by [SportRadar](http://sportradar.us/data/). 
* Bitcoin rates, information, etc. will be provided by [Coinbase](https://coinbase.com). 

### Techniques

ML to be discussed at a later time. See one of my senior design project repos ([Devil's Advocate Sentiment](https://github.com/project-em/ns3-sentiment)) for more info. 

## Developing

Base code from [React-Redux-Flask](https://github.com/dternyak/React-Redux-Flask).

### Organization

* ```application/```: Flask backend
* ```migrations/```: Alembic migrations
* ```static/```: React-Redux frontend
* ```static/ethereum```: Truffle (Ethereum) project
* ```tests/```: yeah

### Setup

1. Install Python 2 and virtualenv
2. ```virtualenv env```
3. Activate the environment using the OS-specific activate script
4. ```pip install -r requirements.txt```
5. Get a .env file from someone
6. Install Node.js and NPM
7. ```cd static; npm i```
8. Install [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli)
9. Install truffle ```npm install -g truffle```
10. Install ethereum testrpc ```npm install -g ethereumjs-testrpc```

### Database Management

The workflow used is a normal SQL migration through Alembic/SQLAlchemy

* Create the DB: ```python manage.py create_db```
* Make a migration: ```python manage.py db migrate```
* Push the migration: ```python manage.py db upgrade```

### Running locally

* Start backend: ```heroku local dev```
* Start frontend: ```cd static; npm start```

### How to call backend from React

1. Define action steps (get, recieve) in ```/static/src/constants/index.js```
2. Make a new file in ```/static/src/reducers/``` similar to an existing one, but using the action steps you just made. You will need to import them.
3. Make a new function in ```/utils/http_functions.js```
4. Import the reducers file into your view like this: ```import * as actionCreators from '../actions/<my_reducer_file>';```
5. Import the new reducer file into ```rootReducers``` in ```/static/src/reducers/index.js```
6. Place something like this above your class declaration:
```
function mapStateToProps(state) {
    return {
        data: state.data,
        loaded: state.data.loaded,
    };
}


function mapDispatchToProps(dispatch) {
    return bindActionCreators(actionCreators, dispatch);
}

@connect(mapStateToProps, mapDispatchToProps)
```
7. Add an action in ```/static/src/actions/data.js```
8. Place the http function you defined in props on your view
9. Call the function.
