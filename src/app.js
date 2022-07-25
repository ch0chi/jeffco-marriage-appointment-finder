import dotenv from 'dotenv';
dotenv.config();
import axios from "axios";
import {promises as fs} from 'fs';
import {IncomingWebhook} from "@slack/webhook";


let bookingUrls = [];
let appEnv = process.env.APP_ENV;
let slackWebhook = new IncomingWebhook(process.env.SLACK_WEBHOOK_URL);
let syncInterval;

const setBookingUrls = (url) => {
    if(!bookingUrls.includes(url)){
        bookingUrls.push(url);
    }
}

const getBookingUrls = () => {
    return bookingUrls;
}

const fetchBookingUrls = async () => {
    let data;
    try{
        if(appEnv === 'prod') {
            let res = await axios.get(process.env.SCHEDULER_URL);
            data = res.data;
            console.log(data);
        } else{
            let res = await fs.readFile(('./sampleData.txt'),{encoding:'utf8', flag:'r'});
            data = JSON.parse(res);
        }
        let services = data.services;
        let bookables = data.bookables;
        let serviceId = null;

        services.forEach((service) => {
            if(service.name === 'Marriage License Application') {
                serviceId = service.id;
            }
        });
        bookables.forEach((bookable) => {
            let servicesPerformed = bookable.services_performed;
            if(servicesPerformed.includes(serviceId)){
                let url = `https://api.appointlet.com/bookables/${bookable.id}/available_times?service=${serviceId}`;
                setBookingUrls(url);
            }
        });
    }
    catch(err) {
        console.log(`Error: ${err}`);
    }

}

const fetchBookings = async () => {
    let bookableIds = [98548,103175];
    let service = 290851 //marriage appointment id

    for(const bookableId of bookableIds) {
        let url = `https://api.appointlet.com/bookables/${bookableId}/available_times?service=290851`
        let res = await axios.get(url);
        let data = res.data;
        if(Array.isArray(data) && data.length) {
            let message = "Marriage License Appointments Found!";
            await notifySlack(message,true);
        }
    }
}

const notifySlack = async (message,important = false) => {
    let text = `${message}`;
    if(important) {
        text = `<!channel> ${message}`;
    }
    await slackWebhook.send({
        "text": `${text}`
    })
}

const start = () => {
    console.log("Starting...");
    syncInterval = setInterval( async () => {
       await fetchBookings()
           .catch(async (err) =>{
               console.log(err);
               await notifySlack(
                   `Error fetching bookings!: ${err}`,
                   true
               )
               stop();
           });
       intervalCount++;
        if(intervalCount === 12) {
            totalIntervalCount +=intervalCount;
            //send update to slack
            await notifySlack(
                `Finder still running and no appointments have been found.
                There have been ${totalIntervalCount} appointment checks since starting.`
            )
            intervalCount = 0;
        }
    },parseInt(process.env.FETCH_INTERVAL)*1000);


}

const stop = () => {
    clearInterval(syncInterval);
}

let intervalCount = 0;
let totalIntervalCount = 0;
await notifySlack("Started Marriage License Appointment Finder!");
start();