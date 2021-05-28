require('dotenv').config();

//Web server setup
const express = require('express')
const app = express()
const port = process.env.PORT

const PASSWORD = process.env.PASSWORD
const USER = process.env.USERNAME
const DAYS = 21

const PAGINATION_PER_PAGE = 1000

const https = require('https');

// Map of values to place names for travellerDetails.recentTravelinformation.
// Based on schema 4.0.2
const recentTravelDict = {
  "1": "Alberta",
  "2": "British Columbia",
  "3": "Manitoba",
  "4": "New Brunswick",
  "5": "Newfoundland/Labrador",
  "6": "Northwest Territories",
  "7": "Nova Scotia",
  "8": "Nunavut",
  "9": "Ontario",
  "10": "Prince Edward Island",
  "11": "Quebec",
  "12": "Saskatchewan",
  "13": "Yukon",
  "14": "International"
}

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

/**
 * Build a list of Request options.
 *
 * This captures the default authorization and query parameters.
 *
 * @param {object} params_override Query parameters to override.
 * @return {object} Request options.
 */
var options = function(params_override = {}) {
  return {
    method: 'GET',
    url: `${process.env.HOST}/api/forms/${process.env.FORM_SERIES}/submissions`,
    params: Object.assign({
      page: 1,
      per_page: PAGINATION_PER_PAGE,
      'filters[FORMHERO.SUBMITTED_AT][type]': 'DATE',
      'filters[FORMHERO.SUBMITTED_AT][value]': resultWindow(),
      'filters[FORMHERO.SUBMITTED_AT][query]': 'GT',
    },
    params_override),
    headers: {
      authorization: `Bearer ${process.env.API_KEY}`
    },
    httpsAgent: agent
  }
};

let optionsPerDay = function(daysAgo) {
  var dateObj = new Date()
  dateObj.setDate(dateObj.getDate()-daysAgo)
  let dateValue = dateObj.getFullYear() +  "-" + (dateObj.getMonth()+1).toString().padStart(2,0) + "-" + dateObj.getDate().toString().padStart(2,0)
  console.log(dateValue)

  return options({
    'filters[FORMHERO.SUBMITTED_AT][type]': 'DATE',
    'filters[FORMHERO.SUBMITTED_AT][value]': dateValue,
    'filters[FORMHERO.SUBMITTED_AT][query]': 'EQ',
  })
}

function removeLastComma(str) {
    return str.replace(/,(\s+)?$/, '');   
 }

 function travellerHistory(form) {
    var x=0
    var history = ""
    if (form.data[`travellerDetails[0].recentTravel`]) {
      // Before 2021-05-25 travellerDetails was a list.
      while (form.data[`travellerDetails[${x}].recentTravel`]){
          history += form.data[`travellerDetails[${x}].recentTravel`] + "| "
          x ++
      }
    } else {
      // Since 2021-05-25 travelerDetails is a scalar.
      if (recentTravelDict[form.data[`travellerDetails.recentTravel`]]) {
        history = recentTravelDict[form.data[`travellerDetails.recentTravel`]]
      }
      if (form.data[`travellerDetails.recentTravelinformation`]) {
        history +=  ": " + form.data[`travellerDetails.recentTravelinformation`]
      }
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
 * Filter function to strip out entries that do not have travel information.
 *
 * @param {object} form Proof submission.
 * @return {boolean} Include this submission or not?
 */
function excludeNoTravelInfo(form) {
  if (form.data[`travellerDetails[0].recentTravel`]) {
    // Before 2021-05-25 travellerDetails was a list.
    return true
  } else {
    // Since 2021-05-25 travelerDetails is a scalar.
    if (form.data[`travellerDetails.recentTravel`]) {
      return true
    }
  }
  return false
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
  axios.request(optionsPerDay(daysAgo)).then(function (response) {
      const result = response.data.data
      res.write(Buffer.from(toCSV(result.filter(excludeNoTravelInfo).map(pickList))))
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
  axios.request(options({page: page})).then(function (response) {
      var result = response.data.data
      res.write(Buffer.from(toCSV(result.filter(excludeNoTravelInfo).map(pickList))))
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
    users: { [USER] : PASSWORD },
    challenge: true,
}),(req, res) => {  
    console.log(` ${new Date()} ${req.method} ${req.path} ${req.ip}`)
    res.header('Content-Type', 'text/csv')
    recursivelyRetrieveDataAndWriteToResponse(res)
})

app.get('/epiCSVByDay', basicAuth({
    users: { [USER] : PASSWORD },
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

