import dotenv from 'dotenv';
dotenv.config();
import axios from "axios";
import {promises as fs} from 'fs';
import {IncomingWebhook} from "@slack/webhook";


let bookingUrls = [];
let appEnv = process.env.APP_ENV;
let slackWebhook = new IncomingWebhook(process.env.SLACK_WEBHOOK_URL);
let syncInterval;
let intervalTime = process.env.FETCH_INTERVAL;

const setBookingUrls = (url) => {
    if(!bookingUrls.includes(url)){
        bookingUrls.push(url);
    }
}

const getBookingUrls = () => {
    return bookingUrls;
}

const setIntervalTime = (time) => {
    intervalTime = time;
}

const getIntervalTime = () => {
    return intervalTime;
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
    let found = false;

    for(const bookableId of bookableIds) {
        let url = `https://api.appointlet.com/bookables/${bookableId}/available_times?service=290851`
        let res = await axios.get(url);
        console.log('Queried appointlet api');
        let data = res.data;
        if(Array.isArray(data) && data.length) {
            console.log(data);
            for(const appointmentTime of data){
                if(isAppointmentWithinRange(appointmentTime)){
                    found = true;
                    let message = `Marriage license appointment found for date: ${new Date(appointmentTime)}`;
                    await notifySlack(message,true);
                }
            }
        }
    }
    if(found) {
        //appointments found. Let's update the fetch interval so we don't get spammed in slack.
        setIntervalTime(3600);
        console.log(`Fetch Interval now: ${getIntervalTime()}`);
    }
}

/**
 * JeffCo's marriage license is only valid for 35 days after issuing. This checks if the found appointment
 * date is within 35 days of the wedding date.
 * @param appointmentDate
 * @returns {boolean}
 *  Returns true if appointment date within 35 days of wedding date, and false otherwise.
 */
const isAppointmentWithinRange = (appointmentDate) => {
    let weddingDate = new Date(process.env.WEDDING_DATE);
    appointmentDate = new Date(appointmentDate);
    let diff = weddingDate.getTime() - appointmentDate;
    let diffDays = Math.ceil(diff / (1000 * 3600 *24));
    return diffDays <= 35;
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

const start = async () => {
    console.log("Starting...");
    console.log(`Fetch Interval set to ${getIntervalTime()}`);
    await fetchBookings();

    syncInterval = setInterval( async () => {
       await fetchBookings();
       intervalCount++;
       totalIntervalCount +=intervalCount;
       console.log(`Performed ${totalIntervalCount} total checks.`)
        if(intervalCount === 12) {
            await notifySlack(
                `Finder still running and no appointments within 35 days have been found.
                There have been ${totalIntervalCount} appointment checks since starting.`
            )
            intervalCount = 0;
        }
    },parseInt(getIntervalTime())*1000);
}

const stop = () => {
    clearInterval(syncInterval);
}

let intervalCount = 0;
let totalIntervalCount = 0;

await notifySlack(`Started Marriage License Appointment Finder!`,true);
await start()
    .catch(async (err) => {
        console.log(err);
        await notifySlack(
            `There was an error fetching bookings and the app has quit running. Error: ${err}`,
            true
        )
        stop();
    });
