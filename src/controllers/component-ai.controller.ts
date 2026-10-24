import { Request, Response, NextFunction } from "express";
import { geminiService } from "../services/gemini.service";
import {
  SynthesizeComponentInput,
  GenerateComponentInput,
} from "../validators/component.validator";

export const synthesizeComponent = async (
  req: Request<{}, {}, SynthesizeComponentInput>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { code, targetFramework, styling } = req.body;

    const result = await geminiService.synthesizeFromCode({
      code,
      targetFramework,
      styling,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const generateComponent = async (
  req: Request<{}, {}, GenerateComponentInput>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { prompt, category, framework, styling } = req.body;

    const result = await geminiService.generateFromPrompt({
      prompt,
      category,
      framework,
      styling,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
