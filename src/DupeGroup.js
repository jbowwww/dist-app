import React from 'react';
import './DupeGroup.css';
import DupeGroupId from './DupeGroupId.js';
import DupeGroupPaths from './DupeGroupPaths.js';

class DupeGroup extends React.Component {
    constructor(props) {
        super(props);
    }
    render() {
        return (
            <div className={'dupe-group' + (this.props.alternateRow ? ' dupe-group-alternate-row' : '')}>
                <DupeGroupId dupe={ this.props.dupe } />
                <DupeGroupPaths dupe={ this.props.dupe } />
            </div>
        );
    }
}

export default DupeGroup;
