import React from 'react';
import './DupeGroup.css';

function formatSize(size) {
    const suffixes = [ 'bytes', 'KB', 'MB', 'GB', 'TB' ];
    for (var i = 0; size >= 1024; i++) {
        size /= 1024;
    }
    return '' + size.toFixed(2) + ' ' + suffixes[i];
}

class DupeGroup extends React.Component {
    constructor(props) {
        super(props);
        console.log('constructor', 'props', props, 'this.props', this.props, 'this.state', this.state);
    }
    render() {
        console.log('dupegroup.render', 'this.props', this.props, 'this.state', this.state);
        return (
            <div className={'dupe-group' + (this.props.alternateRow ? ' dupe-group-alternate-row' : '')}>
                <span className="dupe-hash">{typeof this.props.dupe._id.hash === 'string' ? (this.props.dupe._id.hash.substr(0, 4) + '..' + this.props.dupe._id.hash.substr(this.props.dupe._id.hash.length - 4)) : '(null)'}</span>
                <span className="dupe-size">{formatSize(this.props.dupe._id.size)}</span>
                <span className="dupe-paths">{this.props.dupe.paths.map(path => <div>{path}</div>)}</span>
            </div>
        );
    }
}

export default DupeGroup;
