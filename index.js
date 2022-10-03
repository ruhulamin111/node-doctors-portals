const express = require('express');
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_KEY);

app.use(cors())
app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.zjrcntk.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ message: 'unauthorized access' })
    }
    const token = authorization;
    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'forbidden access' })
        }
        req.decoded = decoded;
        next()
    })
}

async function run() {
    try {
        await client.connect()
        const servicesCollection = client.db('doctorsPortals').collection('services')
        const bookingsCollection = client.db('doctorsPortals').collection('bookings')
        const userCollection = client.db('doctorsPortals').collection('user')
        const doctorCollection = client.db('doctorsPortals').collection('doctor')
        const paymentCollection = client.db('doctorsPortals').collection('payment')

        const verifyAdmin = async (req, res, next) => {
            const admin = req.decoded.email;
            const adminReq = await userCollection.findOne({ email: admin });
            if (adminReq.role === 'admin') {
                next()
            }
            else {
                return res.status(403).send({ message: 'forbidden access' })
            }
        }

        app.patch('/bookings/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const filter = { _id: ObjectId(id) }
            const updateDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId
                }
            }
            const updated = await bookingsCollection.updateOne(filter, updateDoc)
            const result = await paymentCollection.insertOne(payment)
            res.send(updated)
        })

        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const input = req.body;
            const price = input.price;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card'],
            });
            res.send({ clientSecret: paymentIntent.client_secret })
        })

        app.get('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await doctorCollection.find().toArray()
            res.send(result)
        })

        app.delete('/doctors/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email }
            const result = await doctorCollection.deleteOne(filter)
            res.send(result)
        })

        app.post('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
            const doctor = req.body;
            const result = await doctorCollection.insertOne(doctor);
            res.send(result);
        })

        app.get('/services', async (req, res) => {
            const result = await servicesCollection.find({}).project({ name: 1 }).toArray();
            res.send(result)
        })

        app.get('/user', verifyJWT, async (req, res) => {
            const result = await userCollection.find().toArray()
            res.send(result)
        })

        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email })
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin })
        })

        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true }
            const updateDoc = {
                $set: user,
            }
            const result = await userCollection.updateOne(filter, updateDoc, options)
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN, { expiresIn: '1d' })
            res.send({ result, token })
        })

        app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const updateDoc = {
                $set: { role: 'admin' },
            }
            const result = await userCollection.updateOne(filter, updateDoc)
            res.send(result)
        })

        app.get('/booking', verifyJWT, async (req, res) => {
            const patient = req.query.email;
            const decoded = req.decoded.email;
            if (patient !== decoded) {
                return res.status(403).send({ message: 'forbidden access' })
            }
            const query = { email: patient }
            const bookings = await bookingsCollection.find(query).toArray()
            res.send(bookings)
        })

        app.post('/bookings', async (req, res) => {
            const booking = req.body;
            const query = { serviceName: booking.serviceName, date: booking.date, bookingId: booking.bookingId, email: booking.email, slot: booking.slot };
            const exists = await bookingsCollection.findOne(query);
            if (exists) {
                return res.send({ success: false, booking: exists })
            }
            const result = await bookingsCollection.insertOne(booking);
            return res.send({ success: true, result })
        })

        app.get('/bookings/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const result = await bookingsCollection.findOne(query)
            res.send(result)
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
