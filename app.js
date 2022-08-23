const express = require("express");
const app = express();
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;
app.use(express.json());
const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server started at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error : ${e.message}`);
    process.exit(1);
  }
};
initializeDbAndServer();
//Authenticating Token
const AuthenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "wwwww", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};
//Register
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const doesUserExists = `
  SELECT *
  FROM user where username='${username}'`;
  const userExistingResponse = await db.get(doesUserExists);
  if (userExistingResponse === undefined) {
    if (password.length > 6) {
      const addingUser = `
      INSERT INTO user(username,password,name,gender)
      VALUES('${username}','${hashedPassword}','${name}','${gender}')`;
      const addingResponse = await db.run(addingUser);
      response.status(200);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});
//Login
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const checkingUser = `SELECT * FROM user WHERE username='${username}'`;
  const checkingResponse = await db.get(checkingUser);
  if (checkingResponse !== undefined) {
    const comparingPasswords = await bcrypt.compare(
      password,
      checkingResponse.password
    );
    if (comparingPasswords === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "wwwww");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});
//getting userId based on username
const gettingUserId = async (username) => {
  const userQuery = `SELECT * FROM user WHERE username='${username}'`;
  const userQueryResponse = await db.get(userQuery);
  return userQueryResponse.user_id;
};
const changingNames = (one) => {
  return {
    username: one.username,
    tweet: one.tweet,
    dateTime: one.date_time,
  };
};
const tweeting = (two) => {
  return {
    tweet: two.tweet,
    likes: two.likes,
    replies: two.replies,
    dateTime: two.date_time,
  };
};
app.get("/user/tweets/feed/", AuthenticateToken, async (request, response) => {
  const { username } = request;
  const userId = await gettingUserId(username);
  const getQuery = `SELECT username,tweet,date_time
   FROM (follower INNER JOIN tweet ON follower.following_user_id=tweet.user_id) AS T NATURAL JOIN user
   WHERE follower.follower_user_id=${userId}
   ORDER BY date_time DESC
   LIMIT 4`;
  const getQueryResponse = await db.all(getQuery);
  response.send(getQueryResponse.map((eachOne) => changingNames(eachOne)));
});
//user Following
app.get("/user/following/", AuthenticateToken, async (request, response) => {
  const { username } = request;
  const userFollowsId = await gettingUserId(username);
  const userFollowsQuery = `SELECT name
  FROM (follower INNER JOIN user ON follower.following_user_id=user.user_id)
  WHERE follower.follower_user_id=${userFollowsId}`;
  const userFollowsResponse = await db.all(userFollowsQuery);
  response.send(userFollowsResponse);
});
//people following user
app.get("/user/followers/", AuthenticateToken, async (request, response) => {
  const { username } = request;
  const userIdFollows = await gettingUserId(username);
  const userFollowsQuery = `
    SELECT name
    FROM follower INNER JOIN user on follower.follower_user_id = user.user_id
    WHERE follower.following_user_id=${userIdFollows}`;
  const userFollowResponse = await db.all(userFollowsQuery);
  response.send(userFollowResponse);
});
//getting tweet based on tweet id
app.get("/tweets/:tweetId/", AuthenticateToken, async (request, response) => {
  const { username } = request;
  const userId = await gettingUserId(username);
  const { tweetId } = request.params;
  const getTweetQuery = `
SELECT
*
FROM
tweet INNER JOIN follower ON tweet.user_id = follower.following_user_id
WHERE
tweet_id = ${tweetId} AND follower_user_id = ${userId};
`;
  const tweet = await db.get(getTweetQuery);
  if (tweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const getLikeCountQuery = `
SELECT
COUNT(*) as likes
FROM
tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id
WHERE tweet.tweet_id = ${tweetId}
`;
    const getLikeCount = await db.all(getLikeCountQuery);
    const getReplyQuery = `
SELECT
COUNT(*) as replies
FROM
tweet INNER JOIN reply ON tweet.tweet_id = reply.tweet_id
WHERE tweet.tweet_id = ${tweetId}
`;
    const getReplyCount = await db.all(getReplyQuery);
    response.send({
      tweet: tweet["tweet"],
      likes: getLikeCount[0]["likes"],
      replies: getReplyCount[0]["replies"],
      dateTime: tweet["date_time"],
    });
  }
});
//getting likes
app.get(
  "/tweets/:tweetId/likes/",
  AuthenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const userId = await gettingUserId(username);

    const getTweetQuery = `
SELECT
*
FROM
tweet INNER JOIN follower ON tweet.user_id = follower.following_user_id
WHERE
tweet_id = ${tweetId} AND follower_user_id = ${userId};
`;
    const tweet = await db.get(getTweetQuery);
    if (tweet === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getLikeCountQuery = `
SELECT
username
FROM
(tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id)INNER JOIN user ON user.user_id = like.user_id
WHERE tweet.tweet_id = ${tweetId}
`;
      const getLikeCount = await db.all(getLikeCountQuery);
      const dataList = getLikeCount.map((each) => each.username);
      response.send({ likes: dataList });
    }
  }
);
//getting replies
app.get(
  "/tweets/:tweetId/replies/",
  AuthenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const userId = await gettingUserId(username);

    const getTweetQuery = `
SELECT
*
FROM
tweet INNER JOIN follower ON tweet.user_id = follower.following_user_id
WHERE
tweet_id = ${tweetId} AND follower_user_id = ${userId};
`;
    const tweet = await db.get(getTweetQuery);
    if (tweet === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getReplyQuery = `
SELECT
name ,
reply
FROM
(tweet INNER JOIN reply ON tweet.tweet_id = reply.tweet_id ) INNER JOIN user ON user.user_id = reply.user_id
WHERE tweet.tweet_id = ${tweetId}
`;
      const getReplyCount = await db.all(getReplyQuery);
      response.send({ replies: getReplyCount });
    }
  }
);
//getting user tweets
app.get("/user/tweets/", AuthenticateToken, async (request, response) => {
  const { username } = request;
  const userId = await gettingUserId(username);
  const tweetQuery = `
SELECT
tweet,COUNT(*) AS likes,
(
SELECT
COUNT(*) AS replies
FROM
tweet INNER JOIN reply ON tweet.tweet_id = reply.tweet_id
WHERE tweet.user_id = ${userId}
GROUP BY
tweet.tweet_id
) AS replies,tweet.date_time
FROM
tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id
WHERE tweet.user_id = ${userId}
GROUP BY
tweet.tweet_id;
`;
  const tweetData = await db.all(tweetQuery);
  response.send(tweetData.map((eachTwo) => tweeting(eachTwo)));
});
//creating User
app.post("/user/tweets/", AuthenticateToken, async (request, response) => {
  const { username } = request;
  const userId = await gettingUserId(username);
  const { tweet } = request.body;
  const postTweetQuery = `
INSERT INTO
tweet (tweet,user_id)
VALUES
('${tweet}',${userId})
`;
  await db.run(postTweetQuery);
  response.send("Created a Tweet");
});
//deleting tweet
app.delete(
  "/tweets/:tweetId/",
  AuthenticateToken,
  async (request, response) => {
    const { username } = request;
    const userId = await gettingUserId(username);
    const { tweetId } = request.params;
    const getTweetQuery = `
SELECT
*
FROM
tweet
WHERE tweet_id = ${tweetId}
`;
    const tweet = await db.get(getTweetQuery);
    const { user_id } = tweet;
    if (user_id === userId) {
      const deleteTweetQuery = `
DELETE FROM
tweet
WHERE tweet_id = ${tweetId}
`;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);
module.exports = app;
