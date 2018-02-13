import React, { Component } from 'react';
import logo from './logo.svg';
import './App.css';
// import ReactJson from 'react-json-view';
// import bodyParser from 'body-parser';
import DupeGroup from './DupeGroup.js';

class App extends Component {
    constructor(props) {
        super(props);
        this.state = { dupes: [] };
        // console.log('constructor', 'props', props, 'state', this.state);
    }
    componentDidMount() {
        // console.log('componentDidMount');
    }
    onEdit(item) {
        // console.log(item);
        // console.log('this', this)
        fetch('/api/history/' + item.updated_src.market).then(res => res.json()).then(r => {
            console.log('res', r);
        });
        return true;
    }
    getDupes() {
        console.log('getDupes', 'appLogo', (this.appLogo));
        this.appLogo.classList.add('App-logo-loading');
        fetch('/db/fs/file/duplicates/').then(res => res.json()).then(r => {
            console.log('duplicates', r);
            this.appLogo.classList.remove('App-logo-loading');
            this.setState({ dupes: r });
        });
    }
    render() {
      return (
          <div className="App">
            <header className="App-header">
              <img id="app-logo" src={ logo } className="App-logo" alt="logo" ref={el => this.appLogo = el} />
              <h3 className="App-title">dist-app dupe finder</h3>
              <button id="btnGetDupes" onClick={ this.getDupes.bind(this) }>Get Dupes</button>
            </header>
            <content className="App-content">
                <div className="dupe-groups-container">
                    { this.state.dupes.map((dupe, index) => ( <DupeGroup dupe={ dupe } alternateRow={ index % 2 === 0 } /> )) }
                </div>
            </content>
          </div>
        );
    }
}

export default App;
