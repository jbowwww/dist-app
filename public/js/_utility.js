
function toggleDisplay(id) {
	// TODO: Might want to change this to jquery $() or HTML query selector
	var subtree = document.getElementById('subtree-' + id);
	var expander = document.getElementById('expander-' + id);
	if (subtree && expander) {
		subtree.classList.toggle('expanded');
		// subtree.style.display =
			// (subtree.style.display || 'none') == 'none'	? 'block' : 'none';
			expander.classList.toggle('expanded');
		// expander.src = //style.background =
			// (expander.src /*style.background*/ || '/images/expand.gif') == '/images/expand.gif' ? '/images/collapse.gif' : '/images/expand.gif';
	}
	else
		throw new Error("toggleDisplay('" + id + "') did not find element(s)");
}
