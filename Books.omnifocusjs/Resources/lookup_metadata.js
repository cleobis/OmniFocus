var _ = function(){
  "use strict";
  
  const GOODREADS_API_KEY = "<<<ENTER GOODREADS KEY>>>";
  
  function ensureArray(a) {
    return Array.isArray(a) ? a : [a]
  } ;
  
  // Call fetch on a URL object and return a Promise
  function urlFetchPromise(url) {
    return new Promise((resolve, reject) => {
      url.fetch(resolve, reject) ;
    }) ;
  }
  
  // Object for representing a source for the book we want to query. E.g. a library or book store.
  // Arguments
  //  - name - The name of the lookup
  //  - f - a function that performs the lookup. It is passed a dictionary of 
  //    book info. It returns a length two array [found, url]. Found is a 
  //    boolean if the lookup was successful. Url is a link to the book.
  //  - annotate - Defaults false. Boolean if the task name should be updated if the lookup
  //    was successful
  //  - tag - Defaults disabled. Name of tag to apply if the lookup was successful.
  function Lookup(name, f, annotate=false, tag){
    this.name = name ;
    this._fun = f ;
    this.annotate = annotate ;
    this.tag = tag ;
    if (tag)
      this.tag = tagNamed(tag) || new Tag(tag) ;
  }
  Lookup.prototype.search = function(book) {
    return this._fun(book).then(([found, url]) => new LookupResult(this, found, url)) ;
  };
  
  // Object for holding the results of a lookup
  function LookupResult(lookup, found, url) {
    this.lookup = lookup ;
    this.found = found ;
    this.url = url ;
  }
  
  // Flow control exceptions
  // AbortError - Stop processing all tasks but don't show an error. E.g. user clicks cancel.
  // ContinueError - Stop processing this task and add to an error summary. E.g. code error.
  // SilentError - Stop processing this task but don't add to error summary. E.g. user skips a book.
  class AbortError extends Error {} 
  class ContinueError extends Error {}
  class SilentError extends Error {}
  
  
  var action = new PlugIn.Action(async function(selection) {
    
    //const parser = PlugIn.find("local.patterson.mark.omnifocus.books").fast_xml_parser.parser
    const parser = this.fast_xml_parser.parser
    
    // Synchronization objects.
    let prev_task_promise = Promise.resolve() ; // Ensure we dispaly forms for tasks in order and can abort all tasks at once
    let all_tasks = [] ; // Collect all tasks so we can show a single error message
    
    // Initialize lookups. It is inside the Action so that any tags are created only once the action is run for the first time.
    // ************************************************************************
    // ******** Edit this array to customize what sources are searched ********
    // ************************************************************************
    const lookups = [
      new Lookup("Goodreads", book => {
        return Promise.resolve([true, book.url])
      }),
    
      new Lookup("CPL", book => {
        let url = `((title:(${book.title}) OR title:(${book.original_title})) AND contributor:(${book.author}) )` ;
        url = "https://chipublib.bibliocommons.com/v2/search?custom_edit=undefined&query=" + encodeURIComponent(url) + "&searchType=bl&suppress=true" ;
        return urlFetchPromise(URL.fromString(url)).then(ret => {
          const str = ret.toString()
          let found ;
          if (str.indexOf("<h4>Nothing found for") >= 0)
            found = false;
          else if (str.indexOf("<h3>Filter your results by...") >= 0)
            found = true;
          else
            throw new ContinueError(`Unable to determine availability for ${book.title} by calling ${url}.`)
          return [found, url]
        });
      }, true, "CPL"),
      new Lookup("Amazon", book => {
        return Promise.resolve([true, "https://www.goodreads.com/book_link/follow/1?book_id=" + book.id])
      })
    ]
    const lookup_tags = lookups.flatMap(l => l.tag ? [l.tag] : [])
    
    
    selection.tasks.forEach(task => {
      let book // Data sharing within then() clauses.
      
      // Lookup the book on Goodreads
      // Remove "Read" prefix and [...] suffix from the task name to use as the query
      const query = task.name.replace(/^\s*Read\s/, "").replace(/ \[[^\]].+\]$/, "") ; 
      const u = URL.fromString("https://www.goodreads.com/search/index.xml?key=" + GOODREADS_API_KEY + "&q=" + encodeURIComponent(query));
      const fetch_promise = urlFetchPromise(u) ;

      //Wait for the query to finish AND for the UI interactions from the previous loop iteration to be done
      prev_task_promise = Promise.all([fetch_promise, 
        prev_task_promise.catch(err => {
          if (!(err instanceof ContinueError)) {
            throw(err)
          }
        })])
        
      .then(([ret,]) => {
        // Process search response
        let dom = parser.parse(ret.toString())
        let results
        try {
          results = dom.GoodreadsResponse.search.results
        } catch (err) {
          throw new ContinueError("Error with search.\n" + err + "\nResponse:\n" + ret.toString())
        }

        if (!results.work) {
          throw new ContinueError("No matches were found.")
        }

        // Display choice form
        let form = new Form()
        let opts = ensureArray(results.work).map(w => {
          const bb = w.best_book;
          return [bb.id, bb.title + " by " + bb.author.name]
        });
        const field = new Form.Field.Option(
          "menuElement",
          null,
          opts.map(o => o[0]),
          opts.map(o => o[1]),
          opts[0][0],
          );
        field.allowsNull = true ;
        field.nullOptionTitle = "<skip>" ;
        form.addField(field) ;
        return form.show("Select the matching book for \"" + query + ".\" The task will be updated with metadata.", "Update task")
        .catch(form => {throw new AbortError()})
      })
      
      // Execution forks here and the next look interation could start while we update the task in the background
      
      all_tasks.push(prev_task_promise.then(form => {
        // Process user selection and query for more info
        const book_id = form.values['menuElement'];
        if (!book_id) {
          // User choose skip
          throw new SilentError() ;
        }
        const u = URL.fromString("https://www.goodreads.com/book/show/" + book_id + ".xml?key=" + GOODREADS_API_KEY);
        return urlFetchPromise(u)
      })
      .then((ret) => {
        // Process the book info
        const dom = parser.parse(ret.toString())
        book = dom.GoodreadsResponse.book
        book = {
          id: book.id,
          title: book.title,
          original_title: ensureArray(book.work)[0].original_title,
          author: ensureArray(book.authors.author)[0].name,
          image_url: book.small_image_url,
          isbn: book.isbn,
          isbn13: book.sibn13,
          url: book.url,
          description: book.description,
        }
        
        return Promise.all(lookups.map(l => l.search(book)))
        
      }).then(lookup_results => {
        // Update the task description
        console.log("Updating description")
        let desc = task.note.replace(/\n?~~~ Automatic content below ~~~(.|\n)*$/,"")
        if (desc)
          desc += "\n" ;
        desc += "~~~ Automatic content below ~~~\n" ;
        desc += lookup_results.map(r => {
          if (r.found)
            return `* ${r.lookup.name} - ${r.url}\n`
          else if (r.url)
            return `* ${r.lookup.name} not found - ${r.url}\n`
          else
            return `* ${r.lookup.name} not found\n`
        }).join("")
        desc += "\n"
        desc += book.description.replace(/<br\s*\/>/g, "\n") ;
        task.note = desc
        
        // Update the task name
        let title = "Read " + book.title + " by " + book.author
        const annotate = lookup_results.flatMap(r => (r.found && r.lookup.annotate) ? [r.lookup.name] : []).join()
        if (annotate) {
          title += " [" + annotate + "]"
        }
        task.name = title
        
        // Apply tags
        if (lookup_tags) {
          const tags = lookup_results.flatMap(r => (r.found && r.lookup.tag) ? [r.lookup.tag] : [])
          task.removeTags(lookup_tags) ; // In case they are re-running after a bad match
          task.addTags(tags) ;
        }
        
        // Download cover
        if (book.image_url.indexOf("/assets/nophoto/") >= 0)
          throw new SilentError("No image.")
        else
          return urlFetchPromise(URL.fromString(book.image_url)) ;
          
      }).then((img) => {
        // Attach cover to task
        let filename = "cover." + book.image_url.substring(book.image_url.lastIndexOf('.') + 1)
        const i = task.attachments.findIndex(a => a.filename == filename)
        if (i >= 0)
          task.removeAttachmentAtIndex(i)
        task.addAttachment(FileWrapper.withContents(filename, img)) ;
        
        return null ; // No message
      })
      .catch(err => {
        if (err instanceof AbortError || err instanceof SilentError)
          return null ; // No message
        const str = "Error processing task " + task.name + ":\n" + err
        console.log(str)
        return "Error processing task " + task.name + ":\n" + err
      }))
    });
    
    Promise.all(all_tasks).then(msgs => {
      console.log(JSON.stringify(msgs))
      const msg = msgs.filter(m => !!m).join("\n\n")
      if (msg) {
        new Alert("Errors occurred", msg).show()
      }
    })
    
  }) ;

  // If needed, uncomment, and add a function that returns true if the current selection is appropriate for the action.
  action.validate = function(selection){
      return selection.tasks.length >= 1 ;
  };

  return action;
}();
_;