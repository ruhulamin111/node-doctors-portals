const express = require('express');
const cors = require('cors');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion } = require('mongodb');

app.use(cors())
app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.zjrcntk.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        await client.connect()
        const servicesCollection = client.db('doctorsPortals').collection('services')
        const bookingsCollection = client.db('doctorsPortals').collection('bookings')

        app.get('/services', async (req, res) => {
            const result = await servicesCollection.find({}).toArray()
            res.send(result)
        })

        app.post('/bookings', async (req, res) => {
            const booking = req.body;
            const query = { serviceName: booking.serviceName, date: booking.date, bookingId: booking.bookingId, email: booking.email };
            const exists = await bookingsCollection.findOne(query);
            if (exists) {
                return res.send({ success: false, booking: exists })
            }
            const result = await bookingsCollection.insertOne(booking);
            return res.send({ success: true, result })
        })

        app.get('/available', async (req, res) => {
            const date = req.query.date;
            const services = await servicesCollection.find().toArray()
            const query = { date: date }
            const booking = await bookingsCollection.find(query).toArray()
            services.forEach(service => {
                const bookingservice = booking.filter(item => item.serviceName === service.name);
                const booked = bookingservice.map(item => item.slot)
                const available = service.slots.filter(slot => !booked.includes(slot))
                service.slots = available;
            })
            res.send(services)
        })


        console.log('doctors portals database connected');
    }
    finally {
    }
}
run().catch(console.dir)

app.get('/', (req, res) => {
    res.send('Hello doctors portals')
})

app.listen(port, () => {
    console.log(`doctors portals server running on ${port}`)
})
