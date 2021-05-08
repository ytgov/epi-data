require('dotenv').config();

//Web server setup
const express = require('express')
const app = express()
const port = process.env.PORT

const PASSWORD = process.env.PASSWORD
const USER = process.env.USER
const DAYS = 21

const PAGINATION_PER_PAGE = 1000

const https = require('https');

//Basic Auth Setup
const basicAuth = require('express-basic-auth')
//app.use(basicAuth({
//    users: { 'admin' : PASSWORD },
//    challenge: true,
//}))

//Axios setup to call out to TRAC
var axios = require("axios").default;

var agent = new https.Agent({  
    rejectUnauthorized: false
})

var options = {
    method: 'GET',
    url: `${process.env.HOST}/api/forms/${process.env.FORM_SERIES}/submissions`,
    params: {
      // Page is now set dynamically before each call.
      page: 1,
      per_page: PAGINATION_PER_PAGE,
      'filters[FORMHERO.SUBMITTED_AT][type]': 'DATE',
      'filters[FORMHERO.SUBMITTED_AT][value]': resultWindow(),
      'filters[FORMHERO.SUBMITTED_AT][query]': 'GT',

      'filters[travellerDetails.0.recentTravel][type]': 'STRING',
      'filters[travellerDetails.0.recentTravel][value]': '',
      'filters[travellerDetails.0.recentTravel][query]': 'NE',
      'filters[travellerDetails.0.recentTravel][key]': 'travellerDetails[0].recentTravel'
    },
    headers: {
      authorization: `Bearer ${process.env.API_KEY}`
    },
    httpsAgent: agent
  }

let dynamicOptions = function(daysAgo) {
  // return options;
  var dateObj = new Date()
  dateObj.setDate(dateObj.getDate()-daysAgo)
  let dateValue = dateObj.getFullYear() +  "-" + (dateObj.getMonth()+1).toString().padStart(2,0) + "-" + dateObj.getDate().toString().padStart(2,0)
  console.log(dateValue)

  let daysAgoParams = Object.assign(options.params, {
    'filters[FORMHERO.SUBMITTED_AT][type]': 'DATE',
    'filters[FORMHERO.SUBMITTED_AT][value]': dateValue,
    'filters[FORMHERO.SUBMITTED_AT][query]': 'EQ',
  })

  return Object.assign(options, {
    params: daysAgoParams
  })
}

function removeLastComma(str) {
    return str.replace(/,(\s+)?$/, '');   
 }

 function travellerHistory(form) {
    var x=0
    var history = ""
    while (form.data[`travellerDetails[${x}].recentTravel`]){
        history = history + form.data[`travellerDetails[${x}].recentTravel`] + "| "
        x ++ 
    }
    return removeLastComma(history)
}

function pickList(form) {
    return (
        [ 
            form.data["officeuse.Dateentry"],
            form.data["officeuser.Airline"],
            //form.data["officeuse.flightNumber"],
            travellerHistory(form),
        ]
    )
}

function resultWindow(){
    var currentTime = new Date()
    currentTime.setDate(currentTime.getDate()-DAYS)
    // FIXME Using toISOString is wrong, as toISOString returns a UTC datetime,
    // which can be a different day.
    return currentTime.toISOString().substr(0,10)
}

function toCSV (formData){
    const regex =  /\]\,\[/gm
    const headers = '"Entry Date", "Airline", "Traveller History"\n'
    formData = JSON.stringify(formData)

    var p = formData.replace( regex, "\n")
    return headers + p.slice(2,-2)
}

/**
 * Retrieve data from the API endpoint for a single day.
 *
 * This function does not deal with pagination at all.
 *
 * See https://stackoverflow.com/a/47343357/118996
 *
 * @param {object} res This is the Express response object.
 * @param {number} daysAgo The number of days in the past to query.
 * @param {number} daysAgoLimit At what point to stop.
 */
function recursivelyRetrieveDataOneDayAtATimeAndWriteToResponse(res, daysAgo, daysAgoLimit) {
  axios.request(dynamicOptions(daysAgo)).then(function (response) {
      const result = response.data.data
      res.write(Buffer.from(toCSV(result.map(pickList))))
      if (daysAgo < daysAgoLimit) {
        // Recursively request the previous day of results.
        recursivelyRetrieveDataOneDayAtATimeAndWriteToResponse(res, daysAgo + 1, daysAgoLimit)
      } else {
        // Close the connection once we're done.
        res.end();
      }
    }).catch(function (error) {
      console.error(error);
    });
}

/**
 * Retrieve data from the API endpoint, dealing with pagination.
 *
 * This function ends the response once pagination is complete.
 *
 * @param {object} res This is the Express response object.
 * @param {number} page This is the page to return.
 */
function recursivelyRetrieveDataAndWriteToResponse(res, page = 1) {
  // FIXME: replace thisRequestOptions with options(page).
  var thisRequestOptions = options
  thisRequestOptions.params.page = page
  axios.request(thisRequestOptions).then(function (response) {
      var result = response.data.data
      res.write(Buffer.from(toCSV(result.map(pickList))))
      var pagination = response.data.meta.pagination
      if (pagination && pagination.current_page != pagination.total_pages) {
        // Recursively request the next page of results.
        recursivelyRetrieveDataAndWriteToResponse(res, pagination.current_page + 1)
      } else {
        // Close the connection once we're done.
        res.end();
      }
    }).catch(function (error) {
      console.error(error);
    });
}

app.get('/status', (req, res) => {
    res.send({"status":'OK'})
  })
  

app.get('/epiCSV', basicAuth({
    users: { 'admin' : PASSWORD },
    challenge: true,
}),(req, res) => {  
    console.log(` ${new Date()} ${req.method} ${req.path} ${req.ip}`)
    res.header('Content-Type', 'text/csv')
    recursivelyRetrieveDataAndWriteToResponse(res)
})

app.get('/epiCSVByDay', basicAuth({
    users: { 'admin' : PASSWORD },
    challenge: true,
}),(req, res) => {
    console.log(` ${new Date()} ${req.method} ${req.path} ${req.ip}`)
    res.header('Content-Type', 'text/csv')
    recursivelyRetrieveDataOneDayAtATimeAndWriteToResponse(res, 0, DAYS)
})


app.listen(port, () => {
    console.log(`Epi-App listeing at http://localhost:${port}`)
  })
//console.log(results)

