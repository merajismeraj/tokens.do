-- CreateTable
CREATE TABLE "Visitor" (
    "day" DATE NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "Visitor_pkey" PRIMARY KEY ("day","hash")
);

-- CreateTable
CREATE TABLE "VisitDaily" (
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "VisitDaily_pkey" PRIMARY KEY ("day")
);
