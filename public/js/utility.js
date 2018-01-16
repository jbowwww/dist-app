function toggleDisplay(item, objectId) {
	item.classList.toggle('active');
	// var o = document.getElementById(objectId);
	// if (!o) console.warn("Couldn't find element  with id '" + objectId+ "'");
	// else o.style.display = (o.style.display === '') ? 'block' : '';
}

function toggleDisplayStyle(styleClass, displayStyle = 'block') {
	var style = getCSSRule(styleClass);
	if (style) {
		style.display = (style.display && style.display === 'none') ? style.display = displayStyle : 'none';
	}
}

function setDisplayStyle(styleClass, enable, displayStyle = 'block') {
	var style = getCSSRule(styleClass);
	if (style) {
		style.display = enable ? displayStyle : 'none';
	}
}

function setDisplay(styleClass, enable, displayStyle = 'block') {
	document.querySelectorAll(styleClass).forEach((el) => el.style.display = enable ? displayStyle : 'none');
}

// Stolen from stackoverflow
function getCSSRule(ruleName) {
    ruleName = ruleName.toLowerCase();
    var result = null;
    var find = Array.prototype.find;
    find.call(document.styleSheets, styleSheet => {
        result = find.call(styleSheet.cssRules, cssRule => {
            return cssRule instanceof CSSStyleRule 
                && cssRule.selectorText.toLowerCase() == ruleName;
        });
        return result != null;
    });
    return result;
}