// Custom error that contains a status, title and a server message.
class StatusError extends Error {
    status: number;
    statusTitle: string;
    serverMessage: any;

    constructor(status: number, title: string, serverMessage: any, ...params: any[]) {
        super(...params)
        this.status = status;
        this.statusTitle = title;
        this.serverMessage = serverMessage;
    }
}


interface PGDate {
    year: string,
    month: string,
    day: string
}

interface LibraryGet {
    error: StatusError | null
}

interface LibraryGetAlbums extends LibraryGet{
    albums: string[],
    parameters: any,
}

interface LibraryGetPhotos extends LibraryGet {
    photos: string[],
    parameters: any,
}

interface ContentFilter {
    includedContentCategories?: string[],
    excludedContentCategories?: string[]
}

interface MediaFilter {
    mediaTypes: string[]
}

interface DateRanges {
    startDate: PGDate,
    endDate: PGDate
}

interface DateFilter {
    dates?: PGDate,
    ranges?: DateRanges[]
}


interface SearchFilter {
    contentFilter: ContentFilter,
    mediaTypeFilter?: MediaFilter
    dateFilter?: DateFilter
}

interface SearchParameters {
    filters?: SearchFilter
    albumId?: string,
    pageToken?: any,
    pageSize?: any
}


interface NewMediaStatus {
    message: string
}

interface NewMediaMetadata {
    creationTime: string,
    width: string,
    height: string
}

interface NewMediaItem {
    description: string,
    filename: string,
    id: string,
    mimeType: string,
    productUrl: string,
    mediaMetadata: NewMediaMetadata
}


interface NewMediaItemResult {
    uploadToken: string,
    status: NewMediaStatus,
    mediaItem: NewMediaItem
}

interface NewMediaItemResults {
    newMediaItemResults: NewMediaItemResult[]
}