var _ = function(){
	var action = new PlugIn.Action(function(selection){
		versNum = this.plugIn.version.versionString
		pluginName = this.plugIn.displayName
		pluginID = this.plugIn.identifier
		pluginLibraries = this.plugIn.libraries
		if (pluginLibraries.length != 0){
			libraryNames = []
			pluginLibraries.forEach(function(aLibrary){
				libraryName = aLibrary.name
				libraryVersion = aLibrary.version.versionString
				displayString = libraryName + ' v' + libraryVersion
				libraryNames.push(displayString)
			})
			libraryNamesString = "LIBRARIES:"
			libraryNamesString = libraryNamesString + '\n' + libraryNames.join('\n')
		} else {
			libraryNamesString = "This plugin has no libraries."
		}
		alertTitle = pluginName + ' v.' + versNum
		descriptionString = "A plugin for working with books."
		//companyURL = 'https://omni-automation.com'
		alertMessage = "©2020 Mark Patterson" + '\n'
		alertMessage = alertMessage + pluginID + '\n'
		//alertMessage = alertMessage + companyURL + '\n' + '\n'
		alertMessage = alertMessage + descriptionString + '\n' + '\n' 
		alertMessage = alertMessage + libraryNamesString + '\n' + '\n' 
    alertMessage += "This plugin uses fast-xml-parser (c) 2017 Amit Kumar Gupta\nhttps://github.com/NaturalIntelligence/fast-xml-parser/"
		var alert = new Alert(alertTitle, alertMessage)
		alert.show(function(result){})
	});

	// routine determines if menu item is enabled
	action.validate = function(selection){
		return true
	};

	return action;
}();
_;