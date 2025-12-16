import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import rootrouter from "./routes/index";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

app.use("/api/v1/", rootrouter);

// Routes
app.get("/", (req, res) => {
  res.send("BullTrek Backend running");
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export { app, server };
