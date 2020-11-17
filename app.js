require('dotenv').config();

//Web server setup
const express = require('express')
const app = express()
const port = process.env.PORT

const PASSWORD = process.env.PASSWORD

//Basic Auth Setup
const basicAuth = require('express-basic-auth')
//app.use(basicAuth({
//    users: { 'admin' : PASSWORD },
//    challenge: true,
//}))

//Axios setup to call out to TRAC
var axios = require("axios").default;

var options = {
    method: 'GET',
    url: `${process.env.HOST}${process.env.FORM_SERIES}/submissions`,
    params: {
      page: '1',
      per_page: '25',
      'filters[FORMHERO.SUBMITTED_AT][type]': 'DATE',
      'filters[[FORMHERO.SUBMITTED_AT][value]': '2020-07-01',
      'filters[[FORMHERO.SUBMITTED_AT][query]': 'GT'
    },
    headers: {
      authorization: `Bearer ${process.env.API_KEY}`
    }
  };

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

function toCSV (formData){
    const regex =  /\]\,\[/gm
    const headers = '"Entry Date", "Airline", "Traveller History"\n'
    formData = JSON.stringify(formData)

    var p = formData.replace( regex, "\n")
    return headers + p.slice(2,-2)
}

app.get('/status', (req, res) => {
    res.send({"status":'OK'})
  })
  

app.get('/epiCSV', basicAuth({
    users: { 'admin' : PASSWORD },
    challenge: true,
}),(req, res) => {    
    axios.request(options).then(function (response) {
        var result = response.data.data
        res.header('Content-Type', 'text/csv')
        res.send(Buffer.from(toCSV(result.map(pickList))))
        //res.send(toCSV(result.map(pickList)))
      }).catch(function (error) {
        console.error(error);
      });
})


app.listen(port, () => {
    console.log(`Epi-App listeing at http://localhost:${port}`)
  })
//console.log(results)

