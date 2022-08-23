var _ = function() {
  "use strict";

  function BookState(name, tag, description) {
    this.name = name;
    this.tag = tagNamed(tag) || new Tag(tag);
    this.description = description;
  };

  const states = [
    new BookState("Read", "List", "A book you would like to read"),
    new BookState("Waiting", "Waiting", "A book you have ordered and are waiting to arrive"),
    new BookState("Pickup", "Errands", "Pickup from the library"),
    new BookState("Reading", "Reading", "A book you are reading"),
    new BookState("Return", "Errands", "To be returned to the library"),
    new BookState("Summarize", "Online reading", "Write review or summary of the book")
  ];

  const state_names = states.map(a => a.name);
  const state_name_pattern = "(" + state_names.join("|") + ")";

  function get_state_by_name(name) {
    return states.find(a => a.name == name);
  };

  class AbortError extends Error {}

  var action = new PlugIn.Action(function(selection) {

    selection.tasks.forEach(task => {
      let pattern = new RegExp("^(" + state_name_pattern + ") ");
      let old_state_name = task.name.match(pattern)
      let old_state = (old_state_name) ? get_state_by_name(old_state_name[1]) : null;

      let title = task.name.replace(pattern, "");

      // Display choice form
      let form = new Form()
      let opts = state_names;
      const field = new Form.Field.Option(
        "new_state",
        null,
        states.map(a => a.name),
        states.map(a => a.name + " - " + a.description),
        (old_state) ? old_state.name : null
      );
      form.addField(field);

      form.show("Select the new state for " + title, "Update book")
        .catch(form => {
          throw new AbortError()
        })
        .then(form => {
          let new_state = get_state_by_name(form.values["new_state"]);

          task.name = new_state.name + " " + title;
          if (old_state) {
            task.removeTag(old_state.tag);
          }
          task.addTag(new_state.tag);

        })
    });

  });
  
  return action;
}();
_;
