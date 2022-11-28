const express = require('express');
const cors = require('cors');
const { ObjectId,MongoClient, ServerApiVersion } = require('mongodb');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY)

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.lxrexps.mongodb.net/?retryWrites=true&w=majority`;


const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next){
        console.log('token inside VerifyJWT', req.headers.authorization);
        const authHeader = req.headers.authorization;
        if(!authHeader){
            return res.status(401).send('unauthorized access');
        }

        const token = authHeader.split(' ')[1];

        jwt.verify(token, process.env.ACCESS_TOKEN, function(err, decoded){
            if(err){
                return res.status(403).send({message: 'forbidden access'})
            }
            req.decoded = decoded;
            next();
        })
}

async function run(){
    try{
        const categoryCollection = client.db('usedFurniture').collection('categories');
        const bookingsCollection = client.db('usedFurniture').collection('bookings');
        const usersCollection = client.db('usedFurniture').collection('users');
        const buyersCollection = client.db('usedFurniture').collection('buyers');
        const sellersCollection = client.db('usedFurniture').collection('sellers');
        const productsCollection = client.db('usedFurniture').collection('products');
        const paymentsCollection = client.db('doctorsPortal').collection('payments');


        const verifyAdmin = async (req, res, next) =>{
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await usersCollection.findOne(query);

            if (user?.role !== 'admin') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next();
        }
       // get categories
        app.get('/categories', async(req, res) =>{
            const query = {}
            const cursor = categoryCollection.find(query);
            const categories = await cursor.toArray();
            res.send(categories);
        });
        app.get('/categories/:id', async(req, res) =>{
            const id = req.params.id;
            const query = {_id: ObjectId(id)};
            const category = await categoryCollection.findOne(query);
            res.send(category);
        });
        // get booking id
        app.get('/bookings/:id', async (req, res) =>{
            const id = req.params.id;
            const query = {_id: ObjectId(id)};
            const booking =  await bookingsCollection.findOne(query);
            res.send(booking);
        })


        app.get('/bookings', verifyJWT, async(req, res) => {
            const email = req.query.email;
            decodedEmail = req.decoded.email;
           
            
            if(email !== decodedEmail){
                return res.status(403).send({message: 'forbidden access'});
            }
           
            const query = {email: email};
            const bookings = await bookingsCollection.find(query).toArray();
            res.send(bookings);
        });

        

        app.post('/bookings', async(req, res) => {
            const booking = req.body
            console.log(booking);
          
            const result = await bookingsCollection.insertOne(booking);
            res.send(result);
        });
        //Payment
        app.post('/create-payment-intent', async (req, res) => {
            const booking = req.body;
            const price = booking.price;
            const amount = price * 100;

            const paymentIntent = await stripe.paymentIntents.create({
                currency: 'usd',
                amount: amount,
                "payment_method_types": [
                    "card"
                ]
            });
            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });
        // payment 
        app.post('/payments', async (req, res) =>{
                const payment = req.body;
                const result = await paymentsCollection.insertOne(payment);
                const id = payment.bookingId
                const filter = {_id: ObjectId(id)}
                const updateDoc = {
                    $set: {
                        paid: true,
                        transactionId: payment.transactionId
                    }
                }
                const updatedResult = await bookingsCollection.updateOne(filter, updateDoc)
                res.send(result);
            })

         // create jwt 
        app.get('/jwt', async(req, res) =>{
            const email = req.query.email;
            
            const query = {email: email};
            const user = await usersCollection.findOne(query);
            if(user){
                const token = jwt.sign({email}, process.env.ACCESS_TOKEN, {expiresIn: '24hr'})
                return res.send({accessToken: token})
            }
            res.status(403).send({accessToken: ''})
        });
        // users data
        app.get('/users', async(req, res) =>{
            const query = {};
            const users = await usersCollection.find(query).toArray();
            res.send(users);
        });
        app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email }
            const user = await usersCollection.findOne(query);
            res.send({ isAdmin: user?.role === 'admin' });
        });
         

        app.get('/conditionType', async(req, res) =>{
            const query = {}
            const result = await categoryCollection.find(query).project({condition: 1}).toArray();
            res.send(result);
        })


        app.post('/users',  async(req, res) =>{
            const user = req.body;
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });
         app.delete('/users/:id', verifyJWT, verifyAdmin, async(req, res) => {
            const id = req.params.id;
            const filter = {_id: ObjectId(id)};
            const result = await usersCollection.deleteOne(filter);
            res.send(result);
        })

        app.post('/buyers', async(req, res) =>{
            const buyer = req.body;
            const result = await buyersCollection.insertOne(buyer);
            res.send(result);
        });

        app.post('/sellers', async(req, res) =>{
            const seller = req.body;
            const result = await sellersCollection.insertOne(seller);
            res.send(result);
        });

        //admin verify
        app.put('/users/admin/:id',verifyJWT,verifyAdmin, async(req, res) => {
            const id = req.params.id;
            const filter = {_id: ObjectId(id)}
            const options = { upsert: true};
            const updatedDoc = {
                 $set: {
                     role: 'admin'
                 }
            }
            const result = await usersCollection.updateOne(filter, updatedDoc,options);
            res.send(result);
        });
        

        app.get('/products', verifyJWT, async(req, res) =>{
            const query = {};
             const products = await productsCollection.find(query).toArray();
            res.send(products);
        })

        app.post('/products',verifyJWT, async(req, res) =>{
            const product = req.body;
            const result = await productsCollection.insertOne(product);
            res.send(result);
        });

        app.delete('/products/:id',verifyJWT,  async(req, res) => {
            const id = req.params.id;
            const filter = {_id: ObjectId(id)};
            const result = await productsCollection.deleteOne(filter);
            res.send(result);
        })


    }
    finally{

    }
}

run().catch(err => console.error(err));

app.get('/', (req,res) =>{
    res.send('used products server is running')
})

app.listen(port, () =>{
    console.log(`used products running on ${port}`);
})