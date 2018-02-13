import React from 'react';
import './DupeGroupId.css';

function formatSize(size) {
    const suffixes = [ 'bytes', 'KB', 'MB', 'GB', 'TB' ];
    for (var i = 0; size >= 1024; i++) {
        size /= 1024;
    }
    return '' + size.toFixed(2) + ' ' + suffixes[i];
}

class DupeGroupId extends React.Component {
    constructor(props) {
        super(props);
    }
    render() {
        return (
            <div className="dupe-group-id" id={ 'dg-' + this.props.dupe._id.hash + '-' + this.props.dupe._id.size }>
                <div className="dupe-hash">{typeof this.props.dupe._id.hash === 'string' ? (this.props.dupe._id.hash.substr(0, 4) + '..' + this.props.dupe._id.hash.substr(this.props.dupe._id.hash.length - 4)) : '(null)'}</div>
                <div className="dupe-size">{formatSize(this.props.dupe._id.size)}</div>
            </div>
        );
    }
}

export default DupeGroupId;
