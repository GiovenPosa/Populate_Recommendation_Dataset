const { MongoClient } = require('mongodb');
const mongoose = require('mongoose');
const bycrypt = require('bcryptjs');
const { faker } = require('@faker-js/faker');

const Trip = require('./modals/Trip');
const User = require('./modals/User');
const { start } = require('repl');
const { all } = require('axios');

const MONGO_URI = 'mongodb+srv://appuser1:appuser1@cluster0.jxzjzuo.mongodb.net/recommendation_dataset?retryWrites=true&w=majority&appName=Cluster0';

const client = new MongoClient(MONGO_URI);

async function run() {
  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db('recommendation_dataset');

    const collection = await db.listCollections().toArray();
    console.log('Collections: ', collection.map(c => c.name));
  } catch (error) {
    console.error("Connection error: ", error);
  } finally {
    await client.close();
  }
}
//run();

const bioOptions = [
  "Adventure seeker and beach lover.",
  "Solo traveler discovering new cultures.",
  "Luxury escapes and 5-star stays are my vibe.",
  "Backpacking through Europe one city at a time.",
  "Exploring the world one street food at a time.",
  "I chase sunsets, not deadlines.",
  "Budget traveler who lives for hostels and new friends.",
  "Travel addict and part-time photographer.",
  "Nature lover hiking every trail I can find.",
  "Cultural explorer with a passion for local stories.",
];

const cityOptions = [
  'London', 'New York', 'Paris', 'Tokyo', 'Barcelona',
  'Sydney', 'Dubai', 'Los Angeles', 'Rome', 'Bangkok'
];

let seededUsers = [];
let allTrips = [];

const userCount = 50; // Number of users to seed
const tripCount = 10; // Number of trips per user

async function seedUsers(userCount) {
  await mongoose.connect(MONGO_URI);
  console.log('Seeding users...');

  const users = [];

  for (let i = 0; i < userCount; i++) {
    const hashedPassword = await bycrypt.hash('password123', 10);
    users.push( new User({
      email: faker.internet.email().toLowerCase(),
      password: hashedPassword,
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      dob: faker.date.past(30, new Date('2000-01-01')),
      location: faker.helpers.arrayElement(cityOptions),
      travelStyle: faker.helpers.arrayElement(['Adventure', 'Relaxation', 'Cultural', 'Nature', 'City', 'Budget', 'Luxury']),
      bio: faker.helpers.arrayElement(bioOptions)
    }));
  }

  seededUsers = await User.insertMany(users);
  console.log(`${users.length} users seeded`);
  await mongoose.disconnect();
}

async function seedTrips(tripCount) {
  await mongoose.connect(MONGO_URI);
  console.log('Seeding trips...');

  for (const user of seededUsers) {
    const trips = [];

    for (let i = 0; i < tripCount; i++) {
      const startDate = faker.date.past(1, new Date());
      const endDate = faker.date.future({ refDate: startDate });
      const location = faker.helpers.arrayElement(cityOptions);

      // IT IS IMPORTANT TO SIMULATE LIKES AND SAVES TO REAL LIFE SCENARIOS
      // ->>> positive correlation between trip popularity and number of likes/saves
      // ->>> more popular trips should have more likes and saves
      // ->>> using a random number generator to simulate this
      // generate a random binary score for trip popularity (0 to 1)
      const popularityScore = Math.random();
      const maxLikes = seededUsers.length; // Maximum number of likes a trip can have
      const maxSavedBy = seededUsers.length; // Maximum number of users who can save a trip

      // Calculate number of likes and savedBy based on popularity score
      const numLikes = Math.floor(popularityScore * maxLikes);
      const numSavedBy = Math.floor((popularityScore * maxSavedBy) * faker.number.float({ min: 0.5, max: 1.1 }));

      // Shuffle users to randomly assign likes and savedBy
      const shuffledUsers = faker.helpers.shuffle(seededUsers);
      const likedByUsers = shuffledUsers.slice(0, numLikes);
      const savedByUsers = shuffledUsers.slice(numLikes, numLikes + numSavedBy);

      // gnerate repostedByUsers based on popularity score * scaling factor of 0.10% to 0.3%
      const repostProbability = faker.number.float({ min: 0.1, max: 0.3 });
      const possibleReposters = faker.helpers.shuffle([...likedByUsers, ...savedByUsers]);
      const maxReposts = Math.floor(popularityScore * possibleReposters.length * repostProbability);
      const repostedByUsers = possibleReposters.slice(0, maxReposts);

      const trip = new Trip({
        userId: user._id,
        title: `${location} Adventure`,
        destination: location,
        startDate: startDate,
        endDate: endDate,
        description: faker.lorem.sentence(),
        budget: faker.number.int({ min: 300, max: 5000 }),
        taggedUsers: [],
        likes: likedByUsers.map(u => u._id),
        savedBy: savedByUsers.map(u => u._id),
        posts: [],
        comments: [],
        reviews: [],
        repostCount: repostedByUsers.map(u => u._id),
      });

      trips.push(trip);
      
      // Add trips to 'savedTrips[]' + 'likedTrips[]' array for User who saved this trip
      for (const savedUser of savedByUsers) {
        if (savedUser.savedTrips.length < 5 && !savedUser.savedTrips.includes(trip._id)) {
          savedUser.savedTrips.push(trip._id);
        }
      }
      for (const likedUser of likedByUsers) {
        likedUser.likedTrips = likedUser.likedTrips || [];
        likedUser.likedTrips.push(trip._id);
      }
 
    }

    // save trips to DB
    const createdtrips = await Trip.insertMany(trips);

    // this assigns the User the trips we made for them in their 'trips[]' field.
    user.trips = createdtrips.map(trip => trip._id);
    await user.save();

    console.log(`User ${user.email} has ${createdtrips.length} trips seeded`);
    allTrips.push(...createdtrips);
  }

  // save all modified users with their trips
  await Promise.all(seededUsers.map(user => user.save()));
  await mongoose.disconnect();
}

(async () => {
  await seedUsers(userCount);
  await seedTrips(tripCount);
})();
