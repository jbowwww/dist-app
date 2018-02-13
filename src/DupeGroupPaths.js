import React from 'react';
import './DupeGroupPaths.css';
import DupeGroupPath from './DupeGroupPath.js';

class DupeGroupPaths extends React.Component {
    constructor(props) {
        super(props);
        console.log('constructor', 'props', props, 'this.props', this.props, 'this.state', this.state);
    }
    render() {
        return (
            <div className="dupe-paths">
                {this.props.dupe.paths.map((path, pathIndex) => <DupeGroupPath dupe={ this.props.dupe } path={ path } pathIndex={ pathIndex } />)}
            </div>
        );
    }
}

export default DupeGroupPaths;
