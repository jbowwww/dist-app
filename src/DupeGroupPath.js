import React from 'react';
import './DupeGroupPath.css';

function formatSize(size) {
    const suffixes = [ 'bytes', 'KB', 'MB', 'GB', 'TB' ];
    for (var i = 0; size >= 1024; i++) {
        size /= 1024;
    }
    return '' + size.toFixed(2) + ' ' + suffixes[i];
}

class DupeGroupPath extends React.Component {
    constructor(props) {
        super(props);
        this.state = {};
        console.log('constructor', 'props', props, 'this.props', this.props, 'this.state', this.state);
    }
    onTogglePathCheck(e) {
        console.log('onTogglePathCheck', 'e', e, 'this.props', this.props, 'this.state', this.state);
        this.setState(e.target.checked ? { checked: true } : {});
    }
    render() {
        var id = 'dupe-' + this.props.dupe._id.hash + '-' + this.props.dupe._id.size + '-' + this.props.pathIndex;
        !this.state.checked && (this.state.checked = this.props.pathIndex > 0);
        var checkedProp = this.state.checked ? { checked: true } : {};
        return (
            <div className="dupe-path-label">
                <input type='checkbox' value={ this.props.path } id={ id } { ...checkedProp } onChange={this.onTogglePathCheck.bind(this)} />
                <label class="dupe-path-label" htmlFor={ id }>{ this.props.path }</label>
            </div>
        );
    }
}

export default DupeGroupPath;
