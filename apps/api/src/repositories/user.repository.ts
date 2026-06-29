import { User, IUser } from "@operium/db";
import { CreateUserDTO } from "../types/auth.types.js";

export class UserRepository {
  async findByEmail(email: string): Promise<IUser | null> {
    return await User.findOne({ email });
  }

  async findByGoogleIdOrEmail(googleId: string, email: string): Promise<IUser | null> {
    return await User.findOne({ $or: [{ googleId }, { email }] });
  }

  async findByGithubIdOrEmail(githubId: string, email: string): Promise<IUser | null> {
    return await User.findOne({ $or: [{ githubId }, { email }] });
  }

  async create(userData: CreateUserDTO): Promise<IUser> {
    return await User.create(userData);
  }

  async save(user: IUser): Promise<IUser> {
    return await user.save();
  }
}

export const userRepository = new UserRepository();
